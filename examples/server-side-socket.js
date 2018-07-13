var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var os = require('os');


var app = express();

var maxCapacity = 12;

// var server = require('http').Server(app);
// var io = require('socket.io')(server);
var port
var http;
var server;
let privateKey;
let certificate;
if(app.get('env') === 'development'){
    http = require('http');
    var server = http.Server(app);
}else{
    http = require('https');
    server = http.createServer({
        key: privateKey,
        cert: certificate
    }, app);
}

var io = require('socket.io')(server);

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(function(req, res, next){
  res.io = io;
  next();
});


app.use('/', indexRouter);

io.on('connection', function (socket) {
  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  function contains(haystack, needle){
    for (var i = 0; i < haystack.length; i++) {
      if(haystack[i].id === needle){
        return true;
      }
    }
    return false;
  }

  socket.on('message', function(message, room, toId = null) {
    console.log('Client said: ', message);
    console.log('Socket id:', socket.id );
    // for a real app, would be room-only (not broadcast)
    // socket.broadcast.emit('message', socket.id, message);
    if(toId && io.sockets.adapter.sids[toId][room]){
      //we're sending this specifically to somebody
      socket.broadcast.to(toId).emit('message', socket.id, message);
    }else if (toId){
      socket.emit('error', 'They are not in the correct room');
    }else{
      socket.broadcast.to(room).emit('message', socket.id, message);
    }
  });

  socket.on('create or join', function(room) {
    console.log('Received request to create or join room ' + room);

    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;

    console.log('Room ' + room + ' now has ' + numClients + ' client(s)');

    if (numClients === 0) {
      socket.join(room);
      console.log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);

  } else if (numClients < maxCapacity) {
      console.log('Client ID ' + socket.id + ' joined room ' + room);
      socket.join(room);
      socket.broadcast.to(room).emit('join', room, socket.id);
      socket.emit('joined', room, socket.id);
      // io.sockets.in(room).emit('ready');
    } else { // max two clients
      socket.emit('full', room);
    }
  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('bye', function(){
    console.log('received bye');
  });

  // socket.emit('news', { hello: 'world' });
  // socket.on('my other event', function (data) {
  //   console.log(data);
  // });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = {app: app, server: server};
