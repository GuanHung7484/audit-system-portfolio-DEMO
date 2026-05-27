/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  Gemini Vision API Proxy — Cloudflare Worker             ║
 * ║                                                          ║
 * ║  功能：接收前端圖片辨識請求，轉發給 Google Gemini API    ║
 * ║  安全：GEMINI_API_KEY 存在 Worker 環境變數，不外露       ║
 * ║                                                          ║
 * ║  部署後記得到 Worker Settings → Variables and Secrets    ║
 * ║  加入密鑰：GEMINI_API_KEY = 你的 AIza... 金鑰           ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * 接受端點：POST /api/gemini/vision
 * FormData 欄位：
 *   file               圖片檔案（Blob）
 *   prompt             提示文字
 *   system_instruction 系統指令（可選）
 */

const GEMINI_MODEL  = 'gemini-2.0-flash';
const GEMINI_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

// ── 主入口 ────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/api/gemini/vision' && request.method === 'POST') {
      return handleVision(request, env);
    }

    // 根路徑：確認 Worker 有在跑
    return new Response('✅ Gemini Proxy Worker is running.', { status: 200 });
  }
};

// ── /api/gemini/vision 處理邏輯 ───────────────────────────────
async function handleVision(request, env) {
  const resHeaders = { ...CORS, 'Content-Type': 'application/json' };

  try {
    // 1. 解析 FormData
    const form = await request.formData();
    const fileEntry        = form.get('file');
    const prompt           = form.get('prompt')            || '';
    const systemInstruction = form.get('system_instruction') || '';

    if (!fileEntry) {
      return new Response(
        JSON.stringify({ error: '缺少圖片（file 欄位為必填）' }),
        { status: 400, headers: resHeaders }
      );
    }

    // 2. 圖片轉 base64（用 loop 避免大圖 stack overflow）
    const arrayBuffer = await fileEntry.arrayBuffer();
    const uint8Array  = new Uint8Array(arrayBuffer);
    let binaryStr = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binaryStr += String.fromCharCode(uint8Array[i]);
    }
    const base64Data = btoa(binaryStr);
    const mimeType   = fileEntry.type || 'image/jpeg';

    // 3. 組 Gemini 請求 Body
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

    // 4. 呼叫 Gemini API（key 只在這裡用，不傳回前端）
    const geminiResp = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await geminiResp.json();

    if (!geminiResp.ok) {
      console.error('[Worker] Gemini API 錯誤:', JSON.stringify(data));
    }

    return new Response(JSON.stringify(data), {
      status: geminiResp.status,
      headers: resHeaders
    });

  } catch (err) {
    console.error('[Worker] 例外:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: resHeaders }
    );
  }
}
