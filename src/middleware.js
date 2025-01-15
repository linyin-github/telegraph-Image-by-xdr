import { auth } from "@/auth"


const ROOT = '/';
const PUBLIC_ROUTES = ['/'];
const DEFAULT_REDIRECT = '/login';
const LOGIN = '/login'
const API_ADMIN = "/api/admin"
const ADMIN_PAGE = "/admin"
const AUTH_API = "/api/enableauthapi"
const enableAuthapi = process.env.ENABLE_AUTH_API === 'true';

export default auth(async (req) => {
    const { nextUrl,headers } = req;

    // console.log(req?.auth?.user?.role);
    const role = req?.auth?.user?.role;

    // 检查 referer 中是否包含 031234，如果是则直接放行
    const referer = headers.get("referer") || "";
    if (referer.includes("031234")) {
        return; // 放行
    }

    const isAuthenticated = !!req.auth;
    const isAPI_ADMIN = nextUrl.pathname.startsWith(API_ADMIN);
    const isADMIN_PAGE = nextUrl.pathname.startsWith(ADMIN_PAGE);

    const isAuthAPI = nextUrl.pathname.startsWith(AUTH_API);

    if (!isAuthenticated) {
        if (isAPI_ADMIN) {
            return Response.json(
                { status: "fail", message: "You are not logged in by admin !", success: false },
                { status: 401 },
            )
        }
        else if (isADMIN_PAGE) {
            return Response.redirect(new URL(LOGIN, nextUrl));
        }
        else if (isAuthAPI) {

            if (enableAuthapi && !referer.includes("031234.xyz")) {
                return Response.json(
                    { status: "fail", message: "You are not logged in by user !", success: false },
                    { status: 401 }
                );
            }
            else {
                return
            }
        }

        else {
            return

        }
    }

    if (role === 'admin') {
        return;
    }

    if (role === 'user') {
        if (isAPI_ADMIN || isADMIN_PAGE) {
            return Response.redirect(new URL(LOGIN, nextUrl));

        }
    }

})

// 使用静态 matcher 配置
export const config = {
    matcher: [
        "/admin/:path*",
        "/api/admin/:path*",
        "/api/enableauthapi/:path*"
    ],
};