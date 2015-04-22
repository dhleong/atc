#!/usr/bin/env mocha 
/* jshint indent: false */

// prepare global namespace {{{
global.LOG_DEBUG = 0;
global.log = function() {};
global.ui_log = global.log;

global.Fiber = require('../assets/scripts/fiber.min');
global.$ = {
  each: function(list, fun) {
    if (Array.isArray(list)) {
      return list.forEach(fun);
    } else {
      return Object.keys(list).forEach(function(key) {
        fun(key, list[key]);
      });
    }
  }
}

global.window = {
}

function readAirline(name) {
  return require("../assets/airlines/" + name + ".json");
}
global.prop = {
  aircraft: {
    list: [{
        COMMANDS: [
          "land", "takeoff",
          "turn", "fix", "climb", "altitude",
          "taxi"
        ]
    }]
  },
  airline: { airlines: { } }
};

['aal', 'aca', 'awe', 'baw', 'cessna', 'ual'].forEach(function(icao) {
  global.prop.airline.airlines[icao] =
    readAirline(icao);
});
// }}} 

// clean up mocha stack traces {{{
var path = require('path');
var appRoot = path.resolve(__dirname, '..')+'/';
console.oldError = global.oldError || console.error;
console.error = function () {
  if (typeof arguments.stack !== 'undefined') {
    console.oldError.call(console, arguments.stack);
  } else {
    if (typeof arguments[4] !== 'undefined') {
      var traceToShow = arguments[4].split('\n').slice(0, 4).filter(function(line) {
        return !~line.indexOf('mocha');
      });
      arguments[4] = traceToShow.join('\n').replace(new RegExp(appRoot, 'g'), ''); // jshint ignore:line
    }
    console.oldError.apply(console, arguments);
  }
}
global.oldError = console.oldError;
// }}}

/*
 * normal
 */

var voice = require('../assets/scripts/voice');
require('chai').should();

beforeEach(function() {
  global.prop.voice = null;
  voice.init_pre();
  voice.ready();
});

describe("parts", function() { // {{{
  /*
   * We can do more heuristic approaches to esp
   *  callsign deduction if we can split the raw
   *  input into its relevant parts
   */
  handlesRaw("speedbird 321 taxi runway 17 climb 8000", function(result) {
    result.parts.should.eql([
        "speedbird 321",
        "taxi runway 17",
        "climb 8000"
    ]);
  });

  handlesRaw("steve bird niner 21 text run way one seven, kline and maintain 8000", function(result) {
    result.parts.should.eql([
        "steve bird niner 21",
        "taxi run way one seven,",
        "climb and maintain 8000"
    ]);
  });
}); // }}}

describe("callsign", function() {
  handlesRaw("speedbird 321", function(result) {
    result.callsign.should.equal("BAW321");
  });
  handlesRaw("cessna 321 charlie whiskey", function(result) {
    result.callsign.should.equal("N321CW");
  });

  // TODO united niner 21
  // TODO handle mis-recognized using similarity
})

describe("land", function() {
  handles("land runway one-two left", function(result) {
    result.callsign.should.equal("BAW321");
    result.commands.should.contain({
        command: "land",
        args: "12L"
    });
  });
});

describe("multiple commands", function() { // {{{
  handles("taxi runway 17, after departure climb and maintain 8000", function(result) {
    result.commands.should.contain({
        command: "taxi",
        args: "17"
    });
    result.commands.should.contain({
        command: "climb",
        args: "8"
    });
  });
}); // }}}

describe("toCommand()", function() { // {{{
  handles("land runway one-two left", function(result) {
    result.toCommand().should.equal(
      "BAW321 land 12L"
    );
  });

  handles("taxi runway 17, after departure climb and maintain 8000", function(result) {
    result.toCommand().should.equal(
      "BAW321 taxi 17 climb 8"
    );
  });
}); // }}}

// Util {{{
function handlesRaw(raw, fun) {
  var wrapped;
  if (fun) {
    wrapped = function() {
      fun(voice.process(true, raw));
    };
  }
  it("handles `" + raw + "`", wrapped);
}

function handles(command, fun) {
  handlesRaw("speedbird 321 " + command, fun);
}
// }}}

// vim:fdm=marker
