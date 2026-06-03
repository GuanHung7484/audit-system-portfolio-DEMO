/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  Gemini Vision API Proxy — Cloudflare Worker             ║
 * ║                                                          ║
 * ║  使用 Google Gemini 2.0 Flash 做圖片辨識                 ║
 * ║  Secret: GEMINI_API_KEY                                  ║
 * ╚══════════════════════════════════════════════════════════╝
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    const { pathname } = new URL(request.url);
    if (pathname === '/api/gemini/vision' && request.method === 'POST') {
      return handleVision(request, env);
    }
    return new Response('✅ Gemini Proxy Worker is running.', { status: 200 });
  }
};

async function handleVision(request, env) {
  const resHeaders = { ...CORS, 'Content-Type': 'application/json' };
  try {
    const form = await request.formData();
    const fileEntry         = form.get('file');
    const prompt            = form.get('prompt')             || '';
    const systemInstruction = form.get('system_instruction') || '';

    if (!fileEntry) {
      return new Response(
        JSON.stringify({ error: '缺少圖片（file 欄位為必填）' }),
        { status: 400, headers: resHeaders }
      );
    }

    // 圖片轉 base64
    const arrayBuffer = await fileEntry.arrayBuffer();
    const uint8Array  = new Uint8Array(arrayBuffer);
    let binaryStr = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binaryStr += String.fromCharCode(uint8Array[i]);
    }
    const base64Data = btoa(binaryStr);
    const mimeType   = fileEntry.type || 'image/jpeg';

    // 組 Gemini 請求 Body
    const body = {
      contents: [{
        parts: [
          { text: prompt || '請分析這張圖片' },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }]
    };
    if (systemInstruction) {
      body.system_instruction = { parts: [{ text: systemInstruction }] };
    }

    // 呼叫 Gemini API
    const geminiResp = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await geminiResp.json();
    return new Response(JSON.stringify(data), {
      status: geminiResp.status,
      headers: resHeaders
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: resHeaders }
    );
  }
}
