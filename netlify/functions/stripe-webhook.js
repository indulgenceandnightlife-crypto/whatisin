const Stripe = require('stripe');

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    try {
      // Get full session with line items
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price.product', 'shipping_details']
      });

      const orderItems = JSON.parse(session.metadata.order_items);
      const shipping = fullSession.shipping_details;

      // Build Printful order
      const printfulOrder = {
        recipient: {
          name: shipping.name,
          address1: shipping.address.line1,
          address2: shipping.address.line2 || '',
          city: shipping.address.city,
          state_code: shipping.address.state || '',
          country_code: shipping.address.country,
          zip: shipping.address.postal_code
        },
        items: orderItems.map(item => ({
          variant_id: item.variantId,
          quantity: item.quantity
        }))
      };

      // Send order to Printful
      const printfulRes = await fetch('https://api.printful.com/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(printfulOrder)
      });

      const printfulData = await printfulRes.json();

      if (!printfulRes.ok) {
        console.error('Printful order failed:', printfulData);
        return { statusCode: 500, body: 'Printful order failed' };
      }

      // Confirm the order (moves to production)
      await fetch(`https://api.printful.com/orders/${printfulData.result.id}/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`
        }
      });

      return { statusCode: 200, body: JSON.stringify({ received: true }) };

    } catch (err) {
      console.error('Order processing error:', err);
      return { statusCode: 500, body: err.message };
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};