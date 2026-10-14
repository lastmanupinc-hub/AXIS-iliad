# Axis' Iliad Content Generation & Posting

This directory contains scripts to generate compelling content about the Axis' Iliad free tier and post it to various platforms to build reputation and drive conversions.

## Generated Content

The system generates posts for multiple platforms:

- **Twitter/X**: Thread-style posts highlighting free tier benefits
- **LinkedIn**: Professional posts about developer productivity
- **Dev.to**: Full articles with detailed use cases
- **Discord/Slack**: Rich embeds and formatted messages
- **Generic Webhooks**: Structured JSON payloads

## Scripts

### `generate-posts.js`
Generates and displays all post content without posting. Shows what would be posted to each platform.

```bash
pnpm run generate-posts
```

### `post-content.js`
Posts content to configured APIs/webhooks. Set environment variables for the platforms you want to post to:

```bash
# Discord webhook
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... pnpm run post-content

# Slack webhook
SLACK_WEBHOOK_URL=https://hooks.slack.com/... pnpm run post-content

# Generic webhook
GENERIC_WEBHOOK_URL=https://your-api.com/webhook pnpm run post-content
```

### `test-webhook-server.js`
Runs a local test webhook server to demonstrate posting functionality.

```bash
pnpm run test-webhook
```

Then in another terminal:
```bash
GENERIC_WEBHOOK_URL=http://localhost:3002/webhook pnpm run post-content
```

## Generated Files

- `generated-posts.json`: All generated content in JSON format for manual posting or API integration

## Free Tier Value Proposition

The content focuses on these key benefits:

- **86 AI-generated artifacts** from any codebase
- **Instant analysis** - upload repo or GitHub URL
- **Free forever** - no limitations on free tier
- **Developer productivity** - saves hours on codebase onboarding
- **Comprehensive coverage** - context maps, debug playbooks, skills docs, dependency analysis, framework detection

## API Integration

To integrate with real APIs, set these environment variables:

- `DISCORD_WEBHOOK_URL`: Discord webhook URL
- `SLACK_WEBHOOK_URL`: Slack webhook URL
- `DEVTO_API_KEY`: Dev.to API key for article posting
- `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`: Twitter API credentials

## Example Usage

1. Generate content preview:
   ```bash
   pnpm run generate-posts
   ```

2. Test with local webhook:
   ```bash
   pnpm run test-webhook &
   GENERIC_WEBHOOK_URL=http://localhost:3002/webhook pnpm run post-content
   ```

3. Post to real platforms:
   ```bash
   export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
   export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
   pnpm run post-content
   ```

## Content Strategy

The posts are designed to:
- Highlight the free tier's comprehensive feature set
- Show concrete time-saving benefits
- Position AXIS as the "AI-native development OS"
- Drive traffic to https://iliad.trustfabric.ai
- Encourage signups with clear call-to-action