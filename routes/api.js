/*
*
*
*       Complete the API routing below
*
*
*/

'use strict';

const fetch = require('node-fetch');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

module.exports = function(app) {

  // Función para anonimizar IP
  function hashIP(ip) {
    return crypto.createHash('md5').update(ip).digest('hex');
  }

  const mongoUri = process.env.MONGO_URI;

  app.route('/api/stock-prices')
    .get(async (req, res) => {
      try {
        let { stock, like } = req.query;

        if (!stock) return res.json({ error: 'stock is required' });

        // Asegurar array de máximo 2 stocks
        stock = Array.isArray(stock) ? stock : [stock];
        if (stock.length > 2) return res.json({ error: 'only 1 or 2 stocks supported' });

        like = like === 'true' || like === true;
        const ipHash = hashIP(req.ip);

        const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
        const db = client.db();

        const results = [];

        for (let symbol of stock) {
          symbol = symbol.toUpperCase();

          // Actualizar likes en DB
          const updateObj = { $setOnInsert: { stock: symbol } };
          if (like) updateObj.$addToSet = { likes: ipHash };

          const result = await db.collection('stock').findOneAndUpdate(
            { stock: symbol },
            updateObj,
            { upsert: true, returnDocument: 'after' }
          );

          const likesCount = result.value.likes ? result.value.likes.length : 0;

          // Obtener precio del proxy FCC
          const response = await fetch(`https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${symbol}/quote`);
          const data = await response.json();
          const price = Number(data.latestPrice) || 0;

          results.push({ stock: symbol, price, likes: likesCount });
        }

        client.close();

        // Responder según cantidad de stocks
        if (results.length === 1) {
          return res.json({ stockData: results[0] });
        } else {
          const [a, b] = results;
          return res.json({
            stockData: [
              { stock: a.stock, price: a.price, rel_likes: a.likes - b.likes },
              { stock: b.stock, price: b.price, rel_likes: b.likes - a.likes }
            ]
          });
        }

      } catch (error) {
        console.error(error);
        return res.json({ error: 'external source error' });
      }
    });
};
