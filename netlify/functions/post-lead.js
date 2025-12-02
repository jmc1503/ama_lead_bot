// netlify/functions/post-lead.js

// Lead type → Discord config
const LEAD_TYPE_CONFIG = {
  sneakers: {
    label: 'Sneakers',
    colour: 0x1d9bf0,
    webhookUrl: process.env.WEBHOOK_SNEAKERS,
    roleId: process.env.ROLE_SNEAKERS,
  },
  flips: {
    label: 'Flips',
    colour: 0xa855f7,
    webhookUrl: process.env.WEBHOOK_FLIPS,
    roleId: process.env.ROLE_FLIPS,
  },
  pokemon: {
    label: 'Pokemon',
    colour: 0x22c55e,
    webhookUrl: process.env.WEBHOOK_POKEMON,
    roleId: process.env.ROLE_POKEMON,
  },
  lunchmoney: {
    label: 'Lunch Money',
    colour: 0xef4444,
    webhookUrl: process.env.WEBHOOK_LUNCHMONEY,
    roleId: process.env.ROLE_LUNCHMONEY,
  },
  tickets: {
    label: 'Tickets',
    colour: 0xef4444,
    webhookUrl: process.env.WEBHOOK_TICKETS,
    roleId: process.env.ROLE_TICKETS,
  },
  test: {
    label: 'Test',
    colour: 0xef4444,
    webhookUrl: process.env.WEBHOOK_TEST,
    roleId: process.env.ROLE_TICKETS,
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
    leadProvider,
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
    platform_vinted,

    // sold listings (per platform)
    includeSoldListings,
    soldUrl_ebay,
    soldUrl_facebook,
    soldUrl_stockx,
    soldUrl_goat,
    soldUrl_vinted,

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

    // Lead provider (required, internal only)
    const leadProviderValue = (leadProvider || '').trim();
    const allowedProviders = ['Ed', 'Louis', 'Sunil'];
    if (!allowedProviders.includes(leadProviderValue)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Lead provider is required' }),
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

  // ---------------------------
  // Validation & data building
  // ---------------------------

  // ----- Pricing -----
  let rrpValue = null;
  let resellValue = null;
  let profitValue = null;

  if (usePricing) {
    if (!rrp || !rrp.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'RRP is required when pricing is included' }),
      };
    }

    if (!resellPrice || !resellPrice.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Resell price is required when pricing is included' }),
      };
    }

    rrpValue = parseMoney(rrp);
    resellValue = parseMoney(resellPrice);

    if (rrpValue === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'RRP must be a valid number' }),
      };
    }
    if (resellValue === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Resell price must be a valid number' }),
      };
    }

    profitValue = resellValue - rrpValue;
  }

  // ----- Drop date -----
  let dropLabel = null;
  if (useDropDate) {
    if (isLiveNow) {
      dropLabel = 'Live now';
    } else {
      if (!dropDate || !dropDate.trim()) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Drop date cannot be empty when included (or tick Live Now)',
          }),
        };
      }

      if (dropDate.length > 80) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Drop date must be at most 80 characters' }),
        };
      }

      dropLabel = dropDate.trim();
    }
  }

  // ----- Lead location -----
  let leadLocationText = null;
  if (useLeadLocation) {
    if (!leadLocation || !leadLocation.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Lead location cannot be empty when included' }),
      };
    }

    if (leadLocation.length > 160) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Lead location must be at most 160 characters' }),
      };
    }

    leadLocationText = leadLocation.trim();
  }

  // ----- Platforms -----
  let platformsText = null;
  if (usePlatforms) {
    const platforms = [];
    if (platform_ebay) platforms.push('eBay');
    if (platform_facebook) platforms.push('Facebook Marketplace');
    if (platform_stockx) platforms.push('StockX');
    if (platform_goat) platforms.push('GOAT');
    if (platform_vinted) platforms.push('Vinted');

    if (platforms.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Select at least one resell platform or untick the section',
        }),
      };
    }

    platformsText = platforms.join(', ');
  }

  // ----- Sold listings (per platform, but only if filled) -----
  let soldText = null;
  if (useSoldListings) {
    const platformSoldConfigs = [
      { label: 'eBay',     url: soldUrl_ebay },
      { label: 'Facebook', url: soldUrl_facebook },
      { label: 'StockX',   url: soldUrl_stockx },
      { label: 'GOAT',     url: soldUrl_goat },
      { label: 'Vinted',     url: soldUrl_vinted },
    ];

    const lines = [];

    for (const { label, url } of platformSoldConfigs) {
      if (!url || !url.trim()) {
        continue; // field empty → ignore
      }

      const u = url.trim();

      if (!/^https?:\/\//i.test(u)) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Sold listings URL for ${label} must start with http or https`,
          }),
        };
      }

      if (u.length > 300) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Sold listings URL for ${label} is too long`,
          }),
        };
      }

      lines.push(`**${label}:** [View](${u})`);
    }

    if (lines.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Provide at least one sold listings URL or untick "Sold listings".',
        }),
      };
    }

    soldText = lines.join('\n');
  }

  // ----- Description -----
  let descriptionText = null;
  if (useDescription) {
    if (!description || !description.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Description cannot be empty when included' }),
      };
    }

    if (description.length > 1500) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Description must be at most 1500 characters' }),
      };
    }

    descriptionText = description.trim();
  }

  // ----- Risk -----
  let riskText = null;
  if (useRiskRating) {
    if (!riskRating || !riskRating.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Risk rating cannot be empty when included' }),
      };
    }

    const n = Number(riskRating);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Risk rating must be an integer 1–5' }),
      };
    }

    riskText = `${n} / 5`;
  }

  // ----- Returns -----
  let returnsText = null;
  if (useReturns) {
    if (!returnsInfo || !returnsInfo.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Returns info cannot be empty when included' }),
      };
    }

    if (returnsInfo.length > 500) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Returns info must be at most 500 characters',
        }),
      };
    }

    returnsText = returnsInfo.trim();
  }

  // ----- Misc -----
  let miscText = null;
  if (useMisc) {
    if (!miscInfo || !miscInfo.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Misc info cannot be empty when included' }),
      };
    }

    if (miscInfo.length > 500) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Misc info must be at most 500 characters' }),
      };
    }

    miscText = miscInfo.trim();
  }

  // ----- Image -----
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

  // ---------------------------
  // Build embed fields
  // ---------------------------

  const fields = [];

  // Row 1: RRP / Resell / Est. Profit (inline)
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

  // Row 2: Drop Date + Risk rating (inline on same line)
  if (useDropDate && dropLabel) {
    fields.push({ name: 'Drop Date', value: dropLabel, inline: true });

    if (useRiskRating && riskText) {
      fields.push({ name: 'Risk rating', value: riskText, inline: true });
    }
  } else if (useRiskRating && riskText) {
    // If drop date is not included but risk is, show risk on its own line
    fields.push({ name: 'Risk rating', value: riskText, inline: false });
  }

  // Row 3: Lead location (full width)
  if (useLeadLocation && leadLocationText) {
    fields.push({
      name: 'Lead location',
      value: leadLocationText,
      inline: false,
    });
  }

  // Row 4: Resell platforms (full width)
  if (usePlatforms && platformsText) {
    fields.push({
      name: 'Resell platforms',
      value: platformsText,
      inline: false,
    });
  }

  // Row 5: Sold listings (full width)
  if (useSoldListings && soldText) {
    fields.push({
      name: 'Sold listings',
      value: soldText,
      inline: false,
    });
  }

  // Returns (full width)
  if (useReturns && returnsText) {
    fields.push({
      name: 'Returns',
      value: returnsText,
      inline: false,
    });
  }

  // Misc (full width)
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
    title: titleText,
    description: descriptionBlock || undefined,
    color: 0x6FD262,
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

    // ---------------------------
    // Log to Google Sheets (best-effort)
    // ---------------------------
    const sheetsUrl = process.env.SHEETS_WEBHOOK_URL;
    const sheetsSecret = process.env.SHEETS_SECRET;

    if (sheetsUrl && sheetsSecret) {
      try {
        // Use plain strings; Google Sheet does not care about formatting
        const dropForSheet =
          (useDropDate && dropLabel) ? dropLabel : '';

        const actualStr =
          (usePricing && rrpValue != null) ? rrpValue.toString() : '';

        const potentialStr =
          (usePricing && resellValue != null) ? resellValue.toString() : '';

        const payload = {
          secret: sheetsSecret,
          product: titleText,
          url: (useLeadLocation && leadLocationText) ? leadLocationText : '',
          dropDate: dropForSheet,
          actual: actualStr,
          potential: potentialStr,
          leadProvider: leadProviderValue,
        };

        await fetch(sheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (sheetErr) {
        console.error('Sheets logging error:', sheetErr);
        // Do not fail the request for Sheets errors
      }
    } else {
      console.warn('Sheets logging skipped: SHEETS_WEBHOOK_URL or SHEETS_SECRET not set');
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