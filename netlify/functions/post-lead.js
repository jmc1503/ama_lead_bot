// netlify/functions/post-lead.js

// CONFIG: lead types → webhook & role
const LEAD_TYPE_CONFIG = {
  sneakers: {
    label: 'Sneakers',
    colour: 0x1d9bf0,
    webhookUrl: process.env.WEBHOOK_SNEAKERS,
    roleId: process.env.ROLE_SNEAKERS, // optional
  },
  collectibles: {
    label: 'Collectibles',
    colour: 0xa855f7,
    webhookUrl: process.env.WEBHOOK_COLLECTIBLES,
    roleId: process.env.ROLE_COLLECTIBLES,
  },
  electronics: {
    label: 'Electronics',
    colour: 0x22c55e,
    webhookUrl: process.env.WEBHOOK_ELECTRONICS,
    roleId: process.env.ROLE_ELECTRONICS,
  },
  high_risk: {
    label: 'High-Risk Flip',
    colour: 0xef4444,
    webhookUrl: process.env.WEBHOOK_HIGHRISK,
    roleId: process.env.ROLE_HIGHRISK,
  },
  general: {
    label: 'General',
    colour: 0x64748b,
    webhookUrl: process.env.WEBHOOK_GENERAL,
    roleId: process.env.ROLE_GENERAL,
  },
};

// Helpers
function parseMoney(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[£$, ]/g, '');
  const num = Number(cleaned);
  if (Number.isNaN(num) || num <= 0 || num > 100000) return null;
  return num;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const {
    leadType,
    productName,
    retailPrice,
    expectedResale,
    storeName,
    details,
    authKey,
  } = body;

  // AUTH KEY CHECK
  if (!authKey || authKey !== process.env.LEAD_CONSOLE_PASSWORD) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorised' }),
    };
  }

  // LEAD TYPE CHECK
  if (!leadType || !LEAD_TYPE_CONFIG[leadType]) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid lead type' }),
    };
  }

  const config = LEAD_TYPE_CONFIG[leadType];

  if (!config.webhookUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Webhook not configured for this lead type' }),
    };
  }

  // VALIDATION: product name
  const name = (productName || '').trim();
  if (name.length < 3 || name.length > 100) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Product name must be 3–100 characters' }),
    };
  }

  // Retail
  const retail = parseMoney(retailPrice);
  if (retail === null) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Retail price must be a valid number' }),
    };
  }

  // Resale
  const resale = parseMoney(expectedResale);
  if (resale === null) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Expected resale must be a valid number' }),
    };
  }

  // Store
  const store = (storeName || '').trim();
  if (store.length < 2 || store.length > 80) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Store / Site must be 2–80 characters' }),
    };
  }

  // Details
  const detailsText = (details || '').trim();
  if (!detailsText || detailsText.length > 1000) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Details must be 1–1000 characters' }),
    };
  }

  // Financial formatting
  const retailStr = `£${retail.toFixed(2)}`;
  const resaleStr = `£${resale.toFixed(2)}`;
  const profitStr = `£${(resale - retail).toFixed(2)}`;

  // BUILD EMBED
  const title = `[${config.label}] ${name}`;
  const description = `Store: ${store}\n\n${detailsText}`;

  const embed = {
    title,
    description,
    color: config.colour,
    fields: [
      { name: 'Retail', value: retailStr, inline: true },
      { name: 'Expected Resale', value: resaleStr, inline: true },
      { name: 'Est. Profit (before fees)', value: profitStr, inline: true },
    ],
    footer: {
      text: `Posted via Lead Console • Lead Type: ${config.label}`,
    },
    timestamp: new Date().toISOString(),
  };

  const content = config.roleId ? `<@&${config.roleId}>` : '';

  // SEND TO DISCORD WEBHOOK
  try {
    const discordRes = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        embeds: [embed],
      }),
    });

    if (!discordRes.ok) {
      const text = await discordRes.text();
      console.error('Discord webhook error:', discordRes.status, text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Discord webhook failed' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Lead posted successfully' }),
    };
  } catch (err) {
    console.error('Webhook POST error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal error posting lead' }),
    };
  }
};
