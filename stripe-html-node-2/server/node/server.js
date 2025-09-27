require('dotenv').config();
const express = require('express');
const path = require('path');
const { resolve } = require('path');

const app = express();
const calculateTax = false;



app.use(express.static(staticPath));

// ✅ Listen to PORT from env or default
const PORT = process.env.PORT || 3009;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



// Static files serve karna
app.use(express.static(path.join(__dirname, process.env.STATIC_DIR)));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, process.env.STATIC_DIR, "index.html"));
});




// Stripe initialization
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  appInfo: {
    name: "stripe-samples/accept-a-payment/payment-element",
    version: "0.0.2",
    url: "https://github.com/stripe-samples"
  }
});

app.use(
  express.json({
    verify: function (req, res, buf) {
      if (req.originalUrl.startsWith('/webhook')) {
        req.rawBody = buf.toString();
      }
    },
  })
);

app.get('/', (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

app.get('/config', (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

const calculate_tax = async (orderAmount, currency) => {
  const taxCalculation = await stripe.tax.calculations.create({
    currency,
    customer_details: {
      address: {
        line1: "10709 Cleary Blvd",
        city: "Plantation",
        state: "FL",
        postal_code: "33322",
        country: "US",
      },
      address_source: "shipping",
    },
    line_items: [
      {
        amount: orderAmount,
        reference: "ProductRef",
        tax_behavior: "exclusive",
        tax_code: "txcd_30011000"
      }
    ],
  });

  return taxCalculation;
};

app.get('/create-payment-intent', async (req, res) => {
  let orderAmount = 1400;
  let paymentIntent;

  try {
    const customer = await stripe.customers.create({
      name: "Test User",
      address: {
        line1: "123 Test Street",
        city: "Mumbai",
        state: "MH",
        postal_code: "400001",
        country: "IN"
      }
    });

    if (calculateTax) {
      const taxCalculation = await calculate_tax(orderAmount, "usd");
      paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: taxCalculation.amount_total,
        automatic_payment_methods: { enabled: true },
        metadata: { tax_calculation: taxCalculation.id },
        description: "Test Payment from India",
        customer: customer.id
      });
    } else {
      paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: orderAmount,
        automatic_payment_methods: { enabled: true },
        description: "Test Payment from India",
        customer: customer.id
      });
    }

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (e) {
    return res.status(400).send({
      error: {
        message: e.message,
      },
    });
  }
});

app.post('/webhook', async (req, res) => {
  let data, eventType;

  if (process.env.STRIPE_WEBHOOK_SECRET) {
    let event;
    let signature = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === 'payment_intent.succeeded') {
    console.log('💰 Payment captured!');
  } else if (eventType === 'payment_intent.payment_failed') {
    console.log('❌ Payment failed.');
  }
  res.sendStatus(200);
});
