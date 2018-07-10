'use strict';

var debug = true;

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var logger = require('morgan');
var flash = require('express-flash-2');

var indexRouter = require('./routes/index');

var model = require('./model/index.js');

var secureCfg = require('./secure-config.json')

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(secureCfg.session.cookiePassword));
app.use(session({
	secret: secureCfg.session.cookiePassword,
	resave: true,
	saveUninitialized:true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(flash());

app.use('/', require('./routes/common.js').router);
app.use('/', require('./routes/json.js'));
app.use('/', indexRouter);
app.use('/', require('./routes/secure.js'));
if (debug) {
  var debugRouter = require('./routes/debug');
  app.use('/debug', debugRouter);
}

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

module.exports = app;

