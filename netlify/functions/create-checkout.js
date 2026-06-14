const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { items } = JSON.parse(event.body);

    // Build line items for Stripe
    const lineItems = items.map(item => ({
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
        unit_amount: Math.round(item.price * 100) // Stripe uses cents
      },
      quantity: item.quantity
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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};