export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';



const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400', // 24 hours
	'Content-Type': 'application/json'
};

export async function POST(request) {
	const { env, cf, ctx } = getRequestContext();
	
	if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
		return Response.json({
			status: 500,
			message: `TG_BOT_TOKEN or TG_CHAT_ID is not Set`,
			success: false
		}, {
			status: 500,
			headers: corsHeaders,
		})
	}

	const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || request.socket.remoteAddress;
	const clientIp = ip ? ip.split(',')[0].trim() : 'IP not found';
	const Referer = request.headers.get('Referer') || "Referer";

	const formData = await request.formData();
	const fileType = formData.get('file').type;

	const req_url = new URL(request.url);

	const fileTypeMap = {
		'image/': { url: 'sendPhoto', type: 'photo' },
		'video/': { url: 'sendVideo', type: 'video' },
		'audio/': { url: 'sendAudio', type: 'audio' },
		'application/pdf': { url: 'sendDocument', type: 'document' }
	};

	let defaultType = { url: 'sendPhoto', type: 'photo' };

	const { url: endpoint, type: fileTypevalue } = Object.keys(fileTypeMap)
		.find(key => fileType.startsWith(key))
		? fileTypeMap[Object.keys(fileTypeMap).find(key => fileType.startsWith(key))]
		: defaultType;


	const up_url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${endpoint}`;
	let newformData = new FormData();
	newformData.append("chat_id", env.TG_CHAT_ID);
	newformData.append("caption", 'firstInterface');
	newformData.append(fileTypevalue, formData.get('file'));

	try {
		let responseData = await reTry(up_url,newformData);
		// 调用接口失败时，如果返回码为429，超过调用频率限制，按照响应的时间延时后在调用。
		let n429=0;//定义延时重试次数，防止死循环调用，限制最多10次
		while(n429<10 && responseData && !responseData.ok && responseData.error_code == 429){
			n429++;
			const retryAfter = responseData.parameters.retry_after
			console.log("超过调用频率，延时调用："+retryAfter);
			// 等待 `retry_after` 秒后重试
			// 使用 Promise 和 setTimeout 模拟延时
			await delay((retryAfter * 1000));  // 转换为毫秒
			newformData.set("caption", 'firstInterface-延时重试第'+n429+'次');
            responseData = await reTry(up_url,newformData);
			console.log("延时重试结果："+JSON.stringify(responseData));
		}
		let n = 0;
		// 如果返回其他错误，就重试1次
		while(n<3 && (responseData==null || !responseData.ok || (!responseData.result.photo && !responseData.result.video && !responseData.result.document))){
			console.log("接口调用返回了其他错误，使用while重试3次");
			n++;
			await delay((10 * 1000));  // 最多调用N次，每次延迟10秒调用
			newformData.set("caption", 'firstInterface-while重试');
			responseData = await reTry(up_url,newformData);
			console.log("while重试结果："+JSON.stringify(responseData));
		}
		const fileData = await getFile(responseData);
		const data = {
			"url": `${req_url.origin}/api/cfile/${fileData.file_id}`,
			"code": 200,
			"name": fileData.file_name
		}

		if (!env.IMG) {
			data.env_img = "null"
			return Response.json({
				...data,
				msg: "1"
			}, {
				status: 200,
				headers: corsHeaders,
			})
		} else {
			try {
				const rating_index = await getRating(env, `${fileData.file_id}`);
				const nowTime = await get_nowTime()
				await insertImageData(env.IMG, `/cfile/${fileData.file_id}`, Referer, clientIp, rating_index, nowTime);
				return Response.json({
					...data,
					msg: "2",
					Referer: Referer,
					clientIp: clientIp,
					rating_index: rating_index,
					nowTime: nowTime
				}, {
					status: 200,
					headers: corsHeaders,
				})

			} catch (error) {
				console.log(error);
				await insertImageData(env.IMG, `/cfile/${fileData.file_id}`, Referer, clientIp, -1, nowTime);


				return Response.json({
					"msg": error.message
				}, {
					status: 500,
					headers: corsHeaders,
				})
			}
		}






	} catch (error) {
		console.log(error);
		return Response.json({
			status: 500,
			message: ` ${error.message}`,
			success: false
		}, {
			status: 500,
			headers: corsHeaders,
		})
	}

}

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function reTry(up_url, newformData) {
	try{
		const res_img = await fetch(up_url, {
			method: "POST",
			headers: {
				"User-Agent": " Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
			},
			body: newformData,
		});
		let responseData = await res_img.json();
		return responseData;
	} catch (error) {
		console.log("reTry方法报错了");
		console.log(error);
		return null;
	}
	
}

async function getFile_path(env, file_id) {
	try {
		const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${file_id}`;
		const res = await fetch(url, {
			method: 'GET',
			headers: {
				"User-Agent": " Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome"
			},
		})

		let responseData = await res.json();

		if (responseData.ok) {
			const file_path = responseData.result.file_path
			return file_path
		} else {
			return "error";
		}
	} catch (error) {
		return "error";

	}
}

const getFile = async (response) => {
	try {
		if (!response.ok) {
			return null;
		}

		const getFileDetails = (file) => ({
			file_id: file.file_id,
			file_name: file.file_name || file.file_unique_id
		});

		if (response.result.photo) {
			const largestPhoto = response.result.photo.reduce((prev, current) =>
				(prev.file_size > current.file_size) ? prev : current
			);
			return getFileDetails(largestPhoto);
		}else{
			console.log("不存在response.result.photo");
			console.log(response);
		}

		if (response.result.video) {
			return getFileDetails(response.result.video);
		}

		if (response.result.document) {
			return getFileDetails(response.result.document);
		}

		return null;
	} catch (error) {
		console.error('Error getting file id:', error.message);
		return null;
	}
};



async function insertImageData(env, src, referer, ip, rating, time) {
	try {
		const instdata = await env.prepare(
			`INSERT INTO imginfo (url, referer, ip, rating, total, time)
           VALUES ('${src}', '${referer}', '${ip}', ${rating}, 1, '${time}')`
		).run()
	} catch (error) {

	};
}



async function get_nowTime() {
	const options = {
		timeZone: 'Asia/Shanghai',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	};
	const timedata = new Date();
	const formattedDate = new Intl.DateTimeFormat('zh-CN', options).format(timedata);

	return formattedDate

}



async function getRating(env, url) {

	try {
		const file_path = await getFile_path(env, url);

		const apikey = env.ModerateContentApiKey
		const ModerateContentUrl = apikey ? `https://api.moderatecontent.com/moderate/?key=${apikey}&` : ""

		const ratingApi = env.RATINGAPI ? `${env.RATINGAPI}?` : ModerateContentUrl;

		if (ratingApi) {
			const res = await fetch(`${ratingApi}url=https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${file_path}`);
			const data = await res.json();
			const rating_index = data.hasOwnProperty('rating_index') ? data.rating_index : -1;

			return rating_index;
		} else {
			return 0
		}


	} catch (error) {
		return -1
	}
}
