#!/usr/bin/env node

// track-trial-users.js - Monitor your first trial users and engagement

const https = require('https');

const REPO = 'lastmanupinc-hub/Toolbox';
const API_BASE = 'https://api.github.com/repos/' + REPO;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'AXIS-Toolbox-Monitor/1.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function checkEngagement() {
  console.log('🚀 AXIS Toolbox - Trial User Tracker\n');

  try {
    // Get repo stats
    const repo = await fetchJSON(API_BASE);
    console.log('📊 Repository Stats:');
    console.log(`   ⭐ Stars: ${repo.stargazers_count}`);
    console.log(`   🍴 Forks: ${repo.forks_count}`);
    console.log(`   👀 Watchers: ${repo.watchers_count}`);
    console.log(`   📅 Created: ${new Date(repo.created_at).toLocaleDateString()}`);
    console.log('');

    // Get recent activity
    const events = await fetchJSON(`${API_BASE}/events?per_page=10`);
    console.log('📈 Recent Activity:');
    events.forEach(event => {
      const date = new Date(event.created_at).toLocaleDateString();
      switch(event.type) {
        case 'WatchEvent':
          console.log(`   👁️  ${date}: ${event.actor.login} started watching`);
          break;
        case 'ForkEvent':
          console.log(`   🍴 ${date}: ${event.actor.login} forked the repo`);
          break;
        case 'StarEvent':
          console.log(`   ⭐ ${date}: ${event.actor.login} starred the repo`);
          break;
      }
    });
    console.log('');

    // Check MCP registry mentions
    console.log('🔗 MCP Registry Status:');
    console.log('   ✅ Smithery.ai: https://smithery.ai/server/@lastmanupinc/axis-toolbox');
    console.log('   ✅ Glama.ai: Published');
    console.log('   ⏳ Cursor Marketplace: Application pending');
    console.log('');

    // Trial user targets
    console.log('🎯 Trial User Goals:');
    console.log('   Week 1: 10-20 GitHub stars ⭐');
    console.log('   Week 2: First community mentions 💬');
    console.log('   Week 3: Cursor marketplace approval ✅');
    console.log('   Month 1: 100+ trial users 🎉');
    console.log('');

    console.log('💡 Next Actions:');
    console.log('   1. Post to r/coding, r/programming, r/artificial');
    console.log('   2. Share on Twitter/X with #AI #DeveloperTools');
    console.log('   3. Join Cursor Discord and share your launch');
    console.log('   4. Create Product Hunt page');
    console.log('   5. Reach out to AI tool builders for partnerships');

  } catch (error) {
    console.error('❌ Error fetching data:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   - Repo might be private (make it public)');
    console.log('   - GitHub API rate limit (wait a bit)');
    console.log('   - Network issues (check internet)');
  }
}

checkEngagement();