import fs from 'fs';

async function testApi() {
  const endpoints = [
    'https://api.anipub.xyz/',
    'https://api.anipub.xyz/api/animes',
    'https://api.anipub.xyz/anime',
    'https://api.anipub.xyz/recent',
    'https://api.anipub.xyz/latest'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep);
      const text = await res.text();
      console.log(`\n--- ${ep} [${res.status}] ---`);
      console.log(text.substring(0, 500));
    } catch (e: any) {
      console.log(`\n--- ${ep} ERROR ---`);
      console.log(e.message);
    }
  }
}

testApi();
