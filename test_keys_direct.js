const fs = require('fs');
const path = require('path');

// 1. Read keys from .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

function getEnvVar(name) {
  const match = envContent.match(new RegExp(`^${name}\\s*=\\s*["']?([^"'\r\n]+)["']?`, 'm'));
  return match ? match[1] : null;
}

const minimaxKey = getEnvVar('MINIMAX_API_KEY');
const geminiKey = getEnvVar('GEMINI_API_KEY');

console.log('--- API Key Verification Tool ---');
console.log('MiniMax Key Found:', minimaxKey ? `${minimaxKey.substring(0, 10)}...` : 'MISSING');
console.log('Gemini Key Found:', geminiKey ? `${geminiKey.substring(0, 10)}...` : 'MISSING');
console.log('--------------------------------\n');

async function testMiniMax() {
  if (!minimaxKey) {
    console.log('❌ MiniMax key test skipped: Key not found.');
    return;
  }
  console.log('⚡ Testing MiniMax M3...');
  try {
    const res = await fetch('https://api.minimax.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${minimaxKey}`
      },
      body: JSON.stringify({
        model: 'MiniMax-M3',
        messages: [{ role: 'user', content: 'Say hello!' }]
      })
    });

    if (res.ok) {
      const data = await res.json();
      console.log('✅ MiniMax API Success!');
      console.log('   Response:', data.choices?.[0]?.message?.content);
    } else {
      const errText = await res.text();
      console.log(`❌ MiniMax API Failed with status ${res.status}:`, errText);
    }
  } catch (err) {
    console.log('❌ MiniMax Request Error:', err.message);
  }
}

async function testGemini() {
  if (!geminiKey) {
    console.log('❌ Gemini key test skipped: Key not found.');
    return;
  }
  console.log('⚡ Testing Gemini 3 Pro Preview...');
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say hello!' }] }]
      })
    });

    if (res.ok) {
      const data = await res.json();
      console.log('✅ Gemini API Success!');
      console.log('   Response:', data.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
    } else {
      const errText = await res.text();
      console.log(`❌ Gemini API Failed with status ${res.status}:`, errText);
    }
  } catch (err) {
    console.log('❌ Gemini Request Error:', err.message);
  }
}

async function run() {
  await testMiniMax();
  console.log('');
  await testGemini();
}

run();
