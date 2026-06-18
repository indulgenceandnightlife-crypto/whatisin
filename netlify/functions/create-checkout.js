const Stripe = require('stripe');

// Look up the real, current price for a variant directly from Printful —
// never trust a price sent from the browser.
async function getVerifiedPrice(productId) {
  const res = await fetch(`https://api.printful.com/store/products/${productId}`, {
    headers: { 'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}` }
  });
  if (!res.ok) throw new Error(`Could not verify price for product ${productId}`);
  const data = await res.json();
  return data.result.sync_variants || [];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { items } = JSON.parse(event.body);

    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No items provided' }) };
    }

    // Cache verified variants per product so we don't refetch for every line item
    const productCache = {};

    const lineItems = await Promise.all(items.map(async (item) => {
      if (!productCache[item.productId]) {
        productCache[item.productId] = await getVerifiedPrice(item.productId);
      }
      const variant = productCache[item.productId].find(v => v.id === item.variantId);
      if (!variant) throw new Error(`Variant ${item.variantId} not found for product ${item.productId}`);

      const verifiedPrice = parseFloat(variant.retail_price);

      return {
        price_data: {
          currency: 'nzd',
          product_data: {
            name: item.name,
            images: item.image ? [item.image] : [],
            metadata: {
              printful_variant_id: String(item.variantId),
              printful_product_id: String(item.productId)
            }
          },
          unit_amount: Math.round(verifiedPrice * 100) // server-verified price, not client-submitted
        },
        quantity: item.quantity
      };
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/store.html`,
      shipping_address_collection: {
        allowed_countries: ['NZ', 'AU', 'US', 'GB', 'CA', 'SG', 'JP', 'DE', 'FR']
      },
      metadata: {
        order_items: JSON.stringify(items.map(i => ({
          variantId: i.variantId,
          quantity: i.quantity
        })))
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('Checkout session error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not start checkout. Please try again.' })
    };
  }
};