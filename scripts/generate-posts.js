#!/usr/bin/env node

/**
 * Axis' Iliad Free Tier Content Generator & Poster
 * Generates compelling posts about the free tier and posts them via APIs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Post templates for different platforms
const POST_TEMPLATES = {
  twitter: {
    thread1: `🚀 Tired of manually analyzing codebases? Meet Axis' Iliad - the AI-native dev OS that generates 86 artifacts from any codebase!

Free tier includes:
• Context maps & architecture summaries
• Debug playbooks & incident templates
• Skills docs & .cursorrules

Just upload your repo → get instant insights! #DevTools #AI #OpenSource

https://toolbox.jonathanarvay.com`,

    thread2: `💡 Axis' Iliad free tier just saved me hours on a new codebase!

Got:
• Complete dependency analysis
• Framework detection (60+ languages)
• Import graph visualization
• Root cause checklists

All from one command. Mind = blown 🤯

Try it: https://toolbox.jonathanarvay.com #DeveloperTools #Productivity`,

    thread3: `🔍 Ever joined a project and thought "What the hell is this codebase?"

Axis' Iliad free tier gives you:
• Repo profile with tech stack breakdown
• Architecture summaries
• Hotspot analysis
• Migration guides

Upload any repo → instant clarity! #CodeAnalysis #DevOps

Free forever: https://toolbox.jonathanarvay.com`
  },

  linkedin: {
    post1: `As a developer, I've tried countless tools to understand new codebases. Axis' Iliad just became my go-to.

The free tier alone gives you:
• 86 generated artifacts from any codebase
• Context maps and architecture docs
• Debug playbooks and incident templates
• Skills documentation and AI prompts

It's like having an expert team analyze your code instantly. The AI-native approach is revolutionary.

Check it out: https://toolbox.jonathanarvay.com

#DeveloperTools #AI #OpenSource #Productivity`,

    post2: `Quick thread on Axis' Iliad - the development OS I wish I had 5 years ago:

Free Tier Features:
✅ Upload any codebase → get instant analysis
✅ 60+ language detection
✅ Framework recognition (10+ types)
✅ Dependency hotspots & security insights
✅ Generated documentation & best practices

Pro Tier unlocks 15 more specialized programs for frontend, SEO, branding, marketing, and more.

The deterministic output means you get consistent, high-quality results every time.

Worth every penny for teams, but the free tier alone saves hours of manual analysis.

#DevTools #AI #SoftwareDevelopment`,

    post3: `Building Axis' Iliad taught me something profound about developer tools:

Most tools solve one problem. AXIS solves the entire developer workflow.

Free tier gives you:
• Code analysis & documentation
• Architecture visualization
• Debug assistance
• Skills transfer & onboarding

Pro tier adds specialized programs for every aspect of development.

The AI-native approach means it understands context like a senior developer would.

If you're building dev tools or working with complex codebases, this is worth exploring.

https://axis-api-6c7z.onrender.com

#DeveloperExperience #AI #OpenSource`
  },

  devto: {
    article1: {
      title: "How Axis' Iliad Free Tier Saved Me 10 Hours on a New Codebase",
      content: `# How Axis' Iliad Free Tier Saved Me 10 Hours on a New Codebase

As a developer who's joined multiple teams and inherited various codebases, I know the pain of onboarding to a new project. Documentation is often outdated, architecture decisions are lost to time, and understanding the codebase feels like solving a puzzle with missing pieces.

Enter [Axis' Iliad](https://toolbox.jonathanarvay.com) - an AI-native development operating system that generates 86 artifacts from any codebase instantly.

## What I Got from the Free Tier

Just by uploading my team's monorepo, I received:

### 📊 Context Analysis
- **Architecture Summary**: Complete overview of the system design
- **Dependency Hotspots**: Which packages are critical and why
- **Framework Detection**: All 10+ frameworks identified with confidence scores

### 🐛 Debug Assistance
- **Debug Playbook**: Step-by-step troubleshooting guides
- **Incident Templates**: Standardized response formats
- **Root Cause Checklists**: Systematic problem-solving frameworks

### 📚 Documentation
- **Skills Documentation**: What expertise is needed for this codebase
- **AGENTS.md**: AI agent instructions for the project
- **CLAUDE.md**: Claude-specific prompts and workflows

## The Game-Changing Feature

Unlike other tools that give you generic advice, AXIS understands your specific codebase. The AI analyzes your actual code, dependencies, and patterns to generate tailored insights.

## Try It Yourself

The free tier is completely free with no limitations. Just:

1. Go to [toolbox.jonathanarvay.com](https://toolbox.jonathanarvay.com)
2. Upload your codebase or provide a GitHub URL
3. Get instant analysis

For teams, the Pro tier unlocks 15 additional specialized programs covering frontend audits, SEO analysis, brand guidelines, marketing campaigns, and more.

If you're a developer working with complex codebases, this tool will change how you approach new projects.`
    }
  },

  discord: {
    embed1: {
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
    }
  }
};

// API posting functions
async function postToDiscord(webhookUrl, content) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(content)
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    console.log('✅ Posted to Discord successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to post to Discord:', error.message);
    return false;
  }
}

async function postToDevTo(apiKey, article) {
  try {
    const response = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey,
      },
      body: JSON.stringify({
        article: {
          title: article.title,
          body_markdown: article.content,
          published: true,
          tags: ['javascript', 'typescript', 'ai', 'developer-tools', 'productivity']
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Dev.to API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Posted to Dev.to successfully:', result.url);
    return result;
  } catch (error) {
    console.error('❌ Failed to post to Dev.to:', error.message);
    return null;
  }
}

async function postToTwitter(apiKey, apiSecret, accessToken, accessTokenSecret, content) {
  // Note: Twitter API v2 requires OAuth 2.0 or v1.1 with proper setup
  // This is a simplified example - in production you'd use a proper Twitter client
  console.log('📝 Twitter posting not implemented in this demo');
  console.log('Content would be:', content);
  return null;
}

// Generate posts for different platforms
function generatePosts() {
  const posts = [];

  // Twitter threads
  Object.values(POST_TEMPLATES.twitter).forEach(content => {
    posts.push({
      platform: 'twitter',
      type: 'thread',
      content,
      hashtags: ['DevTools', 'AI', 'OpenSource', 'Developer', 'Productivity']
    });
  });

  // LinkedIn posts
  Object.values(POST_TEMPLATES.linkedin).forEach(content => {
    posts.push({
      platform: 'linkedin',
      type: 'post',
      content,
      hashtags: ['DeveloperTools', 'AI', 'OpenSource', 'SoftwareDevelopment', 'Productivity']
    });
  });

  // Dev.to articles
  Object.values(POST_TEMPLATES.devto).forEach(article => {
    posts.push({
      platform: 'devto',
      type: 'article',
      content: article,
      tags: ['javascript', 'typescript', 'ai', 'developer-tools', 'productivity', 'opensource']
    });
  });

  // Discord embeds
  Object.values(POST_TEMPLATES.discord).forEach(embed => {
    posts.push({
      platform: 'discord',
      type: 'embed',
      content: { embeds: [embed] }
    });
  });

  return posts;
}

// Main execution
async function main() {
  console.log("🚀 Axis' Iliad Free Tier Content Generator & Poster\n");

  const posts = generatePosts();
  console.log(`📝 Generated ${posts.length} posts across ${[...new Set(posts.map(p => p.platform))].length} platforms\n`);

  // Display generated content
  posts.forEach((post, index) => {
    console.log(`${index + 1}. ${post.platform.toUpperCase()} ${post.type}:`);
    if (post.platform === 'devto') {
      console.log(`   Title: ${post.content.title}`);
      console.log(`   Content: ${post.content.content.substring(0, 100)}...`);
    } else if (post.platform === 'discord') {
      console.log(`   Title: ${post.content.embeds[0].title}`);
    } else {
      console.log(`   "${post.content.substring(0, 100)}..."`);
    }
    console.log('');
  });

  // Attempt to post to available APIs
  console.log('🔄 Attempting to post content...\n');

  // Discord webhook (if available)
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook) {
    console.log('📢 Posting to Discord...');
    const discordPost = posts.find(p => p.platform === 'discord');
    if (discordPost) {
      await postToDiscord(discordWebhook, discordPost.content);
    }
  } else {
    console.log('ℹ️  Discord webhook not configured (set DISCORD_WEBHOOK_URL)');
  }

  // Dev.to API (if available)
  const devtoKey = process.env.DEVTO_API_KEY;
  if (devtoKey) {
    console.log('📝 Posting to Dev.to...');
    const devtoPost = posts.find(p => p.platform === 'devto');
    if (devtoPost) {
      await postToDevTo(devtoKey, devtoPost.content);
    }
  } else {
    console.log('ℹ️  Dev.to API key not configured (set DEVTO_API_KEY)');
  }

  // Twitter API (if available)
  const twitterCreds = {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  };

  if (Object.values(twitterCreds).every(v => v)) {
    console.log('🐦 Posting to Twitter...');
    const twitterPost = posts.find(p => p.platform === 'twitter');
    if (twitterPost) {
      await postToTwitter(
        twitterCreds.apiKey,
        twitterCreds.apiSecret,
        twitterCreds.accessToken,
        twitterCreds.accessTokenSecret,
        twitterPost.content
      );
    }
  } else {
    console.log('ℹ️  Twitter API credentials not configured');
  }

  console.log('\n✨ Content generation complete!');
  console.log('💡 To post content, set the following environment variables:');
  console.log('   DISCORD_WEBHOOK_URL - for Discord posts');
  console.log('   DEVTO_API_KEY - for Dev.to articles');
  console.log('   TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET - for Twitter posts');
}

main().catch(console.error);