// functions/api/deepseek.js
export async function onRequestPost(context) {
    try {
        // 1. 从环境变量安全读取密钥
        const DEEPSEEK_API_KEY = context.env.DEEPSEEK_API_KEY;
        if (!DEEPSEEK_API_KEY) {
            return new Response('DeepSeek API Key 未设置', { status: 500 });
        }

        // 2. 获取前端请求体
        const requestBody = await context.request.json();

        // 3. 调用 DeepSeek API
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        // 4. 返回结果给前端
        return new Response(response.body, {
            status: response.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
