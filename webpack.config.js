var path = require('path');

module.exports = {
  entry: './simplertc.js',
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, './')
},
  module: {
      rules: [
          {
             test: /\.js$/,
             loader: 'babel-loader',
             query: {
                 presets: ['es2015']
             }
          }
      ]
  }
};
