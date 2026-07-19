#!/usr/bin/env node

/**
 * Quick Setup Script for Axis' Iliad Content Posting
 * Helps you get the credentials you need
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

console.log("🚀 Axis' Iliad Content Posting Setup\n");

console.log('📋 What you need to get started:\n');

console.log('1. 🎮 DISCORD WEBHOOK (Easiest - 2 minutes)');
console.log('   • Go to your Discord server');
console.log('   • Right-click a channel → Edit Channel → Integrations → Webhooks');
console.log('   • Create webhook → Copy URL');
console.log('   • Set: DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...');
console.log('');

console.log('2. 💬 SLACK WEBHOOK (Also easy - 3 minutes)');
console.log('   • Go to: https://api.slack.com/apps');
console.log('   • Create app → From scratch → Name it "AXIS Content"');
console.log('   • Add features → Incoming Webhooks → Activate');
console.log('   • Add to workspace → Choose channel');
console.log('   • Copy webhook URL');
console.log('   • Set: SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...');
console.log('');

console.log('3. 📝 DEV.TO API KEY (For articles - 5 minutes)');
console.log('   • Go to: https://dev.to/settings/account');
console.log('   • Scroll to "DEV Community API Keys"');
console.log('   • Generate new key → Copy it');
console.log('   • Set: DEVTO_API_KEY=your_key_here');
console.log('');

console.log('4. 🐦 TWITTER/X API (Most complex - 15-30 minutes)');
console.log('   • Go to: https://developer.twitter.com/en/portal/dashboard');
console.log('   • Create project/app → Get API keys');
console.log('   • Need: API Key, API Secret, Access Token, Access Token Secret');
console.log('   • Set all four TWITTER_* variables');
console.log('');

console.log('📄 Generated content is ready in: generated-posts.json');
console.log('🧪 Test locally: pnpm run test-webhook');
console.log('🚀 Post for real: Set env vars, then pnpm run post-content');
console.log('');

console.log('💡 Start with Discord - it\'s the easiest and most engaging for developers!');
console.log('   Once you have a webhook URL, you can start posting immediately.\n');

console.log('🔗 Quick commands:');
console.log('   cp .env.posting.example .env.posting');
console.log('   # Edit .env.posting with your credentials');
console.log('   source .env.posting && pnpm run post-content');