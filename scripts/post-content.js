#!/usr/bin/env node

/**
 * Simple Poster - Posts Axis' Iliad content to available APIs
 * Run with environment variables set for the APIs you want to use
 */

import fs from 'node:fs';
import path from 'node:path';

// Simple posting functions
async function postToWebhook(url, data) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('✅ Posted successfully to webhook');
    return await response.json();
  } catch (error) {
    console.error('❌ Failed to post to webhook:', error.message);
    return null;
  }
}

async function postToDiscordWebhook(webhookUrl, content) {
  const payload = typeof content === 'string'
    ? { content }
    : content;

  return await postToWebhook(webhookUrl, payload);
}

async function postToSlackWebhook(webhookUrl, text) {
  return await postToWebhook(webhookUrl, { text });
}

// Content to post
const POSTS = [
  {
    platform: 'discord',
    content: {
      embeds: [{
        title: "🚀 Axis' Iliad Free Tier - Instant Codebase Analysis",
        description: "Upload any codebase and get 86 AI-generated artifacts instantly. Free forever!",
        color: 0x00ff00,
        fields: [
          {
            name: "🔍 What You Get (Free)",
            value: "• Context maps & architecture docs\n• Debug playbooks & incident templates\n• Skills docs & AI prompts\n• Dependency analysis\n• Framework detection (60+ languages)"
          },
          {
            name: "⚡ How to Use",
            value: "1. Visit https://toolbox.jonathanarvay.com\n2. Upload your repo or GitHub URL\n3. Get instant insights!"
          },
          {
            name: "💎 Pro Features",
            value: "Frontend audits, SEO analysis, brand systems, marketing campaigns, and 11 more specialized programs"
          }
        ],
        footer: {
          text: "AI-native development operating system"
        }
      }]
    }
  },
  {
    platform: 'slack',
    content: `🚀 *Axis' Iliad Free Tier - Instant Codebase Analysis*

Upload any codebase and get 86 AI-generated artifacts instantly. Free forever!

*What You Get (Free):*
• Context maps & architecture docs
• Debug playbooks & incident templates
• Skills docs & AI prompts
• Dependency analysis
• Framework detection (60+ languages)

*How to Use:*
1. Visit https://toolbox.jonathanarvay.com
2. Upload your repo or GitHub URL
3. Get instant insights!

*Pro Features:*
Frontend audits, SEO analysis, brand systems, marketing campaigns, and 11 more specialized programs

#DevTools #AI #OpenSource`
  },
  {
    platform: 'generic_webhook',
    content: {
      title: "Axis' Iliad Free Tier Launch",
      message: "Check out the free tier of Axis' Iliad - AI-native development OS that generates 86 artifacts from any codebase!",
      url: "https://toolbox.jonathanarvay.com",
      features: [
        "Context maps & architecture docs",
        "Debug playbooks & incident templates",
        "Skills docs & AI prompts",
        "Dependency analysis",
        "Framework detection (60+ languages)"
      ]
    }
  }
];

async function main() {
  console.log("🚀 Axis' Iliad Content Poster\n");

  let posted = 0;

  // Try Discord webhook
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook) {
    console.log('📢 Posting to Discord...');
    const discordPost = POSTS.find(p => p.platform === 'discord');
    if (discordPost && await postToDiscordWebhook(discordWebhook, discordPost.content)) {
      posted++;
    }
  }

  // Try Slack webhook
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    console.log('💬 Posting to Slack...');
    const slackPost = POSTS.find(p => p.platform === 'slack');
    if (slackPost && await postToSlackWebhook(slackWebhook, slackPost.content)) {
      posted++;
    }
  }

  // Try generic webhook
  const genericWebhook = process.env.GENERIC_WEBHOOK_URL;
  if (genericWebhook) {
    console.log('🔗 Posting to generic webhook...');
    const genericPost = POSTS.find(p => p.platform === 'generic_webhook');
    if (genericPost && await postToWebhook(genericWebhook, genericPost.content)) {
      posted++;
    }
  }

  if (posted === 0) {
    console.log('ℹ️  No webhooks configured. Set these environment variables to enable posting:');
    console.log('   DISCORD_WEBHOOK_URL - for Discord posts');
    console.log('   SLACK_WEBHOOK_URL - for Slack posts');
    console.log('   GENERIC_WEBHOOK_URL - for generic webhook posts');
    console.log('\n📄 Generated content saved to posts.json for manual posting');
  } else {
    console.log(`\n✅ Successfully posted to ${posted} platform(s)`);
  }

  // Save content to file for manual posting
  const outputPath = path.join(process.cwd(), 'generated-posts.json');
  fs.writeFileSync(outputPath, JSON.stringify(POSTS, null, 2));
  console.log(`📄 Content also saved to: ${outputPath}`);
}

main().catch(console.error);