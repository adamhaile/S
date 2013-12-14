load("lodash.js");
load("benchmark.js");

Benchmark.prototype.setup = function () {

};

var suite = new Benchmark.Suite();

suite
  .add('Closure', function () {
  })
  .add('Prototype', function () {
  })
  .on('cycle', function (event) { print(event.target); })
  .run();