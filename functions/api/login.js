// functions/api/login.js
export async function onRequestPost(context) {
    return new Response(JSON.stringify({
        success: true,
        message: '登录成功'
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
