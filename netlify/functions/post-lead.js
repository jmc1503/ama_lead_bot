// netlify/functions/post-lead.js

// Lead type → Discord config
const LEAD_TYPE_CONFIG = {
  sneakers: {
    label: 'Sneakers',
    colour: 0x1d9bf0,
    webhookUrl: process.env.WEBHOOK_SNEAKERS,
    roleId: process.env.ROLE_SNEAKERS,
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
    title,
    authKey,

    // pricing
    includePricing,
    rrp,
    resellPrice,

    // drop date
    includeDropDate,
    dropDate,
    liveNow,

    // lead location
    includeLeadLocation,
    leadLocation,

    // platforms
    includePlatforms,
    platform_ebay,
    platform_facebook,
    platform_stockx,
    platform_goat,

    // sold listings
    includeSoldListings,
    soldListingsUrl,

    // description
    includeDescription,
    description,

    // risk
    includeRiskRating,
    riskRating,

    // returns
    includeReturns,
    returnsInfo,

    // misc
    includeMisc,
    miscInfo,

    // image
    imageUrl,
  } = body;

  // Auth
  if (!authKey || authKey !== process.env.LEAD_CONSOLE_PASSWORD) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorised' }),
    };
  }

  // Lead type
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
      body: JSON.stringify({ error: 'No webhook configured for this lead type' }),
    };
  }

  // Title (required)
  const titleText = (title || '').trim();
  if (titleText.length < 3 || titleText.length > 150) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Title must be 3–150 characters' }),
    };
  }

  // Flags (checkboxes: present = "on")
  const usePricing = !!includePricing;
  const useDropDate = !!includeDropDate;
  const useLeadLocation = !!includeLeadLocation;
  const usePlatforms = !!includePlatforms;
  const useSoldListings = !!includeSoldListings;
  const useDescription = !!includeDescription;
  const useRiskRating = !!includeRiskRating;
  const useReturns = !!includeReturns;
  const useMisc = !!includeMisc;
  const isLiveNow = !!liveNow;

  // Validation & data building
  let rrpValue = null;
  let resellValue = null;
  let profitValue = null;

  if (usePricing) {
    rrpValue = parseMoney(rrp);
    resellValue = parseMoney(resellPrice);
    if (rrpValue === null || resellValue === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'RRP and Resell must be valid numbers when pricing is included' }),
      };
    }
    profitValue = resellValue - rrpValue;
  }

  let dropLabel = null;
  if (useDropDate) {
    if (isLiveNow) {
      dropLabel = 'Live now';
    } else {
      const d = (dropDate || '').trim();
      if (!d) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Drop date is required or tick Live now' }),
        };
      }
      if (d.length > 80) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Drop date must be at most 80 characters' }),
        };
      }
      dropLabel = d;
    }
  }

  let leadLocationText = null;
  if (useLeadLocation) {
    const loc = (leadLocation || '').trim();
    if (!loc) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Lead location cannot be empty when included' }),
      };
    }
    if (loc.length > 160) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Lead location must be at most 160 characters' }),
      };
    }
    leadLocationText = loc;
  }

  let platformsText = null;
  if (usePlatforms) {
    const platforms = [];
    if (platform_ebay) platforms.push('eBay');
    if (platform_facebook) platforms.push('Facebook Marketplace');
    if (platform_stockx) platforms.push('StockX');
    if (platform_goat) platforms.push('GOAT');

    if (platforms.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Select at least one resell platform or untick the section' }),
      };
    }

    platformsText = platforms.join(', ');
  }

  let soldUrlText = null;
  if (useSoldListings) {
    const u = (soldListingsUrl || '').trim();
    if (!u) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Sold listings URL cannot be empty when included' }),
      };
    }
    if (!/^https?:\/\//i.test(u)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Sold listings URL must start with http or https' }),
      };
    }
    if (u.length > 300) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Sold listings URL is too long' }),
      };
    }
    soldUrlText = u;
  }

  let descriptionText = null;
  if (useDescription) {
    const d = (description || '').trim();
    if (!d) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Description cannot be empty when included' }),
      };
    }
    if (d.length > 1500) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Description must be at most 1500 characters' }),
      };
    }
    descriptionText = d;
  }

  let riskText = null;
  if (useRiskRating) {
    const r = (riskRating || '').trim();
    if (!r) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Risk rating is required when included' }),
      };
    }
    const n = Number(r);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Risk rating must be an integer between 1 and 5' }),
      };
    }
    riskText = `${n} / 5`;
  }

  let returnsText = null;
  if (useReturns) {
    const t = (returnsInfo || '').trim();
    if (!t) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Returns info cannot be empty when included' }),
      };
    }
    if (t.length > 500) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Returns info must be at most 500 characters' }),
      };
    }
    returnsText = t;
  }

  let miscText = null;
  if (useMisc) {
    const t = (miscInfo || '').trim();
    if (!t) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Misc info cannot be empty when included' }),
      };
    }
    if (t.length > 500) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Misc info must be at most 500 characters' }),
      };
    }
    miscText = t;
  }

  let imageUrlText = null;
  if (imageUrl && imageUrl.trim()) {
    const i = imageUrl.trim();
    if (!/^https?:\/\//i.test(i)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Image URL must start with http or https' }),
      };
    }
    if (i.length > 400) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Image URL is too long' }),
      };
    }
    imageUrlText = i;
  }

  // Build embed fields
  const fields = [];

  if (usePricing && rrpValue !== null && resellValue !== null) {
    const rrpStr = `£${rrpValue.toFixed(2)}`;
    const resellStr = `£${resellValue.toFixed(2)}`;
    const profitStr = `£${profitValue.toFixed(2)}`;

    fields.push(
      { name: 'RRP', value: rrpStr, inline: true },
      { name: 'Resell', value: resellStr, inline: true },
      { name: 'Est. Profit (before fees)', value: profitStr, inline: true }
    );
  }

  if (useDropDate && dropLabel) {
    fields.push({ name: 'Drop', value: dropLabel, inline: true });
  }

  if (useLeadLocation && leadLocationText) {
    fields.push({ name: 'Lead location', value: leadLocationText, inline: true });
  }

  if (usePlatforms && platformsText) {
    fields.push({ name: 'Resell platforms', value: platformsText, inline: true });
  }

  if (useRiskRating && riskText) {
    fields.push({ name: 'Risk rating', value: riskText, inline: true });
  }

  if (useSoldListings && soldUrlText) {
    fields.push({
      name: 'Sold listings',
      value: `[View sold listings](${soldUrlText})`,
      inline: false,
    });
  }

  if (useReturns && returnsText) {
    fields.push({
      name: 'Returns',
      value: returnsText,
      inline: false,
    });
  }

  if (useMisc && miscText) {
    fields.push({
      name: 'Misc',
      value: miscText,
      inline: false,
    });
  }

  // Description block
  let descriptionBlock = '';
  if (descriptionText) {
    descriptionBlock += descriptionText;
  }

  const embed = {
    title: `[${config.label}] ${titleText}`,
    description: descriptionBlock || undefined,
    color: config.colour,
    fields,
    footer: {
      text: `Posted via AMA Lead Console • Lead Type: ${config.label}`,
    },
    timestamp: new Date().toISOString(),
  };

  if (imageUrlText) {
    embed.image = { url: imageUrlText };
  }

  const content = config.roleId ? `<@&${config.roleId}>` : '';

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