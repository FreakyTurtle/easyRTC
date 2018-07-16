var path = require('path');

module.exports = {
  entry: './index.js',
  output: {
    filename: 'simplertc.js',
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
