export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};


function getContentType(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'html': 'text/html',
    'json': 'application/json',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'mkv': 'video/x-matroska'
  };
  return mimeTypes[extension] || 'image/jpeg';
}


export async function OPTIONS(request) {
  return new Response(null, {
    headers: corsHeaders
  });
}

// 判断Referer是否允许

export async function GET(request, { params }) {
  const { name } = params;
  const str = name.split(".")[0];
  const sizePattern = /-\d+x\d+$/;
  const hasSize = sizePattern.test(str);

  let base_name = str;
  let width = null;
  let height = null;

  if (hasSize) {
      const sizeMatch = str.match(/-(\d+)x(\d+)$/);
      if (sizeMatch) {
          width = parseInt(sizeMatch[1], 10);
          height = parseInt(sizeMatch[2], 10);
          base_name = str.substring(0, sizeMatch.index);
      }
  }


  console.log("base_name:"+base_name+",width:"+width+",height:"+height);
  let { env, cf, ctx } = getRequestContext();

  let req_url = new URL(request.url);

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

  const cacheKey = new Request(req_url.toString(), request);
  const cache = caches.default;

  // let rating

  // try {
  //   rating = await getRating(env.IMG, `/cfile/${base_name}`);
  //   if (rating === 3 && !(Referer === `${req_url.origin}/admin` || Referer === `${req_url.origin}/list` || Referer === `${req_url.origin}/`)) {
  //     await logRequest(env, base_name, Referer, clientIp);
  //     return Response.redirect(`${req_url.origin}/img/blocked.png`, 302);
  //   }

  // } catch (error) {
  //   console.log(error);

  // }
  // 检查缓存
  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    if (!(Referer === `${req_url.origin}/admin` || Referer === `${req_url.origin}/list` || Referer === `${req_url.origin}/`)) {
      await logRequest(env, base_name, Referer, clientIp);
    }
    // 如果缓存中存在，直接返回缓存响应
    return cachedResponse
  }


  try {

    const file_path = await getFile_path(env, base_name);
    const fileName = file_path.split('/').pop();
    const contentTypeForWh = getContentType(fileName);
    // modify 20250213 ,如果地址没有图片宽度和高度，重新上传获取并更新url地址，使用文件名判断是否需要重新上传获取宽高，只有图片才需要
    console.log("contentTypeForWh:"+contentTypeForWh+",width:"+width+",height:"+height);
    if(!height && !width && contentTypeForWh.indexOf('image')!=-1&&false){
      // 判断是否需要重新获取宽高，如果使用不含宽高的URL查询到数据才需要重新获取并修改url
      let imgWh = await getUrl(env.IMG, `/cfile/${base_name}`);
      if (imgWh === 1) {
        const fileData = await uploadForWH(env,base_name);
        console.log(fileData);
        if(fileData){//防止fileData返回null导致报错
          const update_url = base_name + '-'+ fileData.width +'x'+fileData.height; //拼接图片宽度和高度
          await updateUrl(env,base_name,update_url);
        }
      }
    }

    if (file_path === "error") {
      return Response.json({
        status: 500,
        message: ` ${error.message}`,
        success: false
      }
        , {
          status: 500,
          headers: corsHeaders,
        })

    } else {
      const res = await fetch(`https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${file_path}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      if (res.ok) {
        const fileBuffer = await res.arrayBuffer();
        const contentType = getContentType(fileName);
        console.log("contentType:"+contentType);

        const responseHeaders = {
          "Content-Disposition": `inline; filename=${fileName}`,
          "Access-Control-Allow-Origin": "*",
          "Content-Type": contentType
        };
        const response_img = new Response(fileBuffer, {
          headers: responseHeaders
        });

        ctx.waitUntil(cache.put(cacheKey, response_img.clone()));

        if (Referer === `${req_url.origin}/admin` || Referer === `${req_url.origin}/list` || Referer === `${req_url.origin}/`) {
          return response_img;

        } else if (!env.IMG) {
          return response_img

        } else {
          await logRequest(env, base_name, Referer, clientIp);
          return response_img

        }
      } else {
        return Response.json({
          status: 500,
          message: ` ${error.message}`,
          success: false
        }
          , {
            status: 500,
            headers: corsHeaders,
          })
      }
    }
  } catch (error) {
    return Response.json({
      status: 500,
      message: ` ${error.message}`,
      success: false
    }
      , {
        status: 500,
        headers: corsHeaders,
      })
  }


}

/**
 * 重新通过fileid上传获取图片宽高
 */
async function uploadForWH(env,file_id) {

  const up_url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendPhoto`;
	let newformData = new FormData();
	newformData.append("chat_id", env.TG_CHAT_ID);
	newformData.append("caption", 'uploadForWH');
	newformData.append("photo", file_id); //这里固定图片

  try{
		const res_img = await fetch(up_url, {
			method: "POST",
			headers: {
				"User-Agent": " Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
			},
			body: newformData,
		});
		let responseData = await res_img.json();
    const fileData = await getFile(responseData);
		return fileData;
	} catch (error) {
		console.log("uploadForWH");
		console.log(error);
		return null;
	}
}

const getFile = async (response) => {
	try {
		if (!response.ok) {
			return null;
		}
    // modify 20250212 ，新增图片宽高信息返回，添加到图片访问地址中，用于wordpress预加载时使用
		const getFileDetails = (file) => ({
			file_id: file.file_id,
			file_name: file.file_name || file.file_unique_id,
			width: file.width,
			height: file.height
		});

		if (response.result.photo) {
			const largestPhoto = response.result.photo.reduce((prev, current) =>
				(prev.file_size > current.file_size) ? prev : current
			);
			return getFileDetails(largestPhoto);
		}else{
			console.log("不存在responseData.result.photo");
			console.log(response);
      return null;
		}
	} catch (error) {
		console.error('Error getting file id:', error.message);
		return null;
	}
};

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
      console.log(responseData);
      const file_path = responseData.result.file_path
      return file_path
    } else {
      return "error";
    }
  } catch (error) {
    return "error";

  }


}



// 插入 tgimglog 记录
async function insertTgImgLog(DB, url, referer, ip, time) {
  const iImglog = await DB.prepare('INSERT INTO tgimglog (url, referer, ip, time) VALUES (?, ?, ?, ?)')
    .bind(url, referer, ip, time)
    .run();
}



// 从数据库获取鉴黄信息
async function getRating(DB, url) {
  const ps = DB.prepare(`SELECT rating FROM imginfo WHERE url='${url}'`);
  const result = await ps.first();
  return result ? result.rating : null;
}

// 从数据库获取url地址，用于判断是否需要重新获取宽高信息
async function getUrl(DB, url) {
  const ps = DB.prepare(`SELECT count(1) as num FROM imginfo WHERE url='${url}'`);
  const result = await ps.first();
  return result ? result.num : null;
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


// 异步日志记录
async function logRequest(env, base_name, referer, ip) {
  try {
    const nowTime = await get_nowTime()
    await insertTgImgLog(env.IMG, `/cfile/${base_name}`, referer, ip, nowTime);
    const setData = await env.IMG.prepare(`UPDATE imginfo SET total = total +1 WHERE url = '/rfile/${base_name}';`).run()
  } catch (error) {
    console.error('Error logging request:', error);
  }
}


// 更新url地址
async function updateUrl(env, old_url,update_url) {
  console.log("原url地址："+old_url+",更新url地址："+update_url);
  try {
    const nowTime = await get_nowTime()
    const setData = await env.IMG.prepare(`UPDATE imginfo SET url = '/cfile/${update_url}' WHERE url = '/cfile/${old_url}';`).run()
  } catch (error) {
    console.error('Error update url:', error);
  }
}