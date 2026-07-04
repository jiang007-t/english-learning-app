// functions/api/login.js
export async function onRequestPost(context) {
    try {
        // 1. 从请求体中获取 uid 和 password
        const { uid, password } = await context.request.json();

        // 2. 从环境变量读取管理员密码
        const ADMIN_PASSWORD = context.env.ADMIN_PASSWORD;

        // 3. 简单验证（示例：固定 uid 和从环境变量读取的密码）
        // 在实际项目中，这里应该查询数据库
        if (uid === 'u001' && password === ADMIN_PASSWORD) {
            return new Response(JSON.stringify({
                success: true,
                message: '登录成功',
                user: { uid: 'u001', name: '管理员' }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            return new Response(JSON.stringify({
                success: false,
                message: 'UID 或密码错误'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            message: '服务器错误：' + error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
