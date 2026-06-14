exports.handler = async () => {
  try {
    const response = await fetch('https://api.printful.com/store/products', {
      headers: {
        'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error || 'Failed to fetch products' })
      };
    }

    // Fetch full product details for each product
    const products = await Promise.all(
      data.result.map(async (item) => {
        const detailRes = await fetch(`https://api.printful.com/store/products/${item.id}`, {
          headers: {
            'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`
          }
        });
        const detail = await detailRes.json();
        return detail.result;
      })
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(products)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};