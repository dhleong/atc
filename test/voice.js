#!/usr/bin/env mocha
/* jshint indent: false */

// prepare global namespace {{{
global.LOG_DEBUG = 0;
global.log = function() {};

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
  it("handles `" + raw + "`", function() {
    fun(voice.process(true, raw));
  });
}

function handles(command, fun) {
  handlesRaw("speedbird 321 " + command, fun);
}
// }}}

// vim:fdm=marker
