/*!
 * Casper is a navigation utility for PhantomJS.
 *
 * Documentation: http://n1k0.github.com/casperjs/
 * Repository:    http://github.com/n1k0/casperjs
 *
 * Copyright (c) 2011-2012 Nicolas Perriault
 *
 * Part of source code is Copyright Joyent, Inc. and other Node contributors.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

var fs = require('fs');
var events = require('events');
var utils = require('utils');
var f = utils.format;

exports.create = function(casper, options) {
    return new Tester(casper, options);
};

/**
 * Casper tester: makes assertions, stores test results and display then.
 *
 */
var Tester = function(casper, options) {
    this.currentTestFile = null;
    this.running = false;
    this.suites = [];
    this.options = utils.isObject(options) ? options : {};

    if (!utils.isCasperObject(casper)) {
        throw new CasperError("Tester needs a Casper instance");
    }

    // locals
    var exporter = require('xunit').create();
    var PASS = this.options.PASS || "PASS";
    var FAIL = this.options.FAIL || "FAIL";

    // properties
    this.testResults = {
        passed: 0,
        failed: 0,
        failures: []
    };

    // events
    casper.on('step.error', function(e) {
        casper.test.fail(e);
        casper.test.done();
    });

    this.on('fail', function(details) {
        this.testResults.failures.push(details);
    });

    // methods
    /**
     * Asserts a condition resolves to true.
     *
     * @param  Boolean  condition
     * @param  String   message    Test description
     */
    this.assert = function(condition, message) {
        var status = PASS, eventName;
        if (condition === true) {
            eventName = 'success';
            style = 'INFO';
            this.testResults.passed++;
            exporter.addSuccess("unknown", message);
        } else {
            eventName = 'fail';
            status = FAIL;
            style = 'RED_BAR';
            this.testResults.failed++;
            exporter.addFailure("unknown", message, 'test failed', "assert");
        }
        this.emit(eventName, {
            message: message,
            file:    this.currentTestFile
        });
        casper.echo([this.colorize(status, style), this.formatMessage(message)].join(' '));
    };

    /**
     * Asserts that two values are strictly equals.
     *
     * @param  Mixed   testValue  The value to test
     * @param  Mixed   expected   The expected value
     * @param  String  message    Test description
     */
    this.assertEquals = function(testValue, expected, message) {
        var eventName;
        if (this.testEquals(testValue, expected)) {
            eventName = "success";
            casper.echo(this.colorize(PASS, 'INFO') + ' ' + this.formatMessage(message));
            this.testResults.passed++;
            exporter.addSuccess("unknown", message);
        } else {
            eventName = "fail";
            casper.echo(this.colorize(FAIL, 'RED_BAR') + ' ' + this.formatMessage(message, 'WARNING'));
            this.comment('   got:      ' + utils.serialize(testValue));
            this.comment('   expected: ' + utils.serialize(expected));
            this.testResults.failed++;
            exporter.addFailure("unknown", message, f("test failed; expected: %s; got: %s", expected, testValue), "assertEquals");
        }
        this.emit(eventName, {
            message: message,
            file:    this.currentTestFile
        });
    };

    /**
     * Asserts that a code evaluation in remote DOM resolves to true.
     *
     * @param  Function  fn         A function to be evaluated in remote DOM
     * @param  String    message    Test description
     */
    this.assertEval = function(fn, message) {
        return this.assert(casper.evaluate(fn), message);
    };

    /**
     * Asserts that the result of a code evaluation in remote DOM equals
     * an expected value.
     *
     * @param  Function fn         The function to be evaluated in remote DOM
     * @param  Boolean  expected   The expected value
     * @param  String   message    Test description
     */
    this.assertEvalEquals = function(fn, expected, message) {
        return this.assertEquals(casper.evaluate(fn), expected, message);
    };

    /**
     * Asserts that an element matching the provided CSS3 selector exists in
     * remote DOM.
     *
     * @param  String   selector   CSS3 selectore
     * @param  String   message    Test description
     */
    this.assertExists = function(selector, message) {
        return this.assert(casper.exists(selector), message);
    };

    /**
     * Asserts that a provided string matches a provided RegExp pattern.
     *
     * @param  String   subject    The string to test
     * @param  RegExp   pattern    A RegExp object instance
     * @param  String   message    Test description
     */
    this.assertMatch = function(subject, pattern, message) {
        var eventName;
        if (pattern.test(subject)) {
            eventName = "success";
            casper.echo(this.colorize(PASS, 'INFO') + ' ' + this.formatMessage(message));
            this.testResults.passed++;
            exporter.addSuccess("unknown", message);
        } else {
            eventName = "fail";
            casper.echo(this.colorize(FAIL, 'RED_BAR') + ' ' + this.formatMessage(message, 'WARNING'));
            this.comment('   subject: ' + subject);
            this.comment('   pattern: ' + pattern.toString());
            this.testResults.failed++;
            exporter.addFailure("unknown", message, f("test failed; subject: %s; pattern: %s", subject, pattern.toString()), "assertMatch");
        }
        this.emit(eventName, {
            message: message,
            file:    this.currentTestFile
        });
    };

    /**
     * Asserts a condition resolves to false.
     *
     * @param  Boolean  condition
     * @param  String   message    Test description
     */
    this.assertNot = function(condition, message) {
        return this.assert(!condition, message);
    };

    /**
     * Asserts that the provided function called with the given parameters
     * will raise an exception.
     *
     * @param  Function  fn       The function to test
     * @param  Array     args     The arguments to pass to the function
     * @param  String    message  Test description
     */
    this.assertRaises = function(fn, args, message) {
        try {
            fn.apply(null, args);
            this.fail(message);
        } catch (e) {
            this.pass(message);
        }
    };

    /**
     * Asserts that the current page has a resource that matches the provided test
     *
     * @param Function/String  test      A test function that is called with every response
     * @param  String   message    Test description
     */
    this.assertResourceExists = function(test, message) {
        return this.assert(casper.resourceExists(test), message);
    };

    /**
     * Asserts that at least an element matching the provided CSS3 selector
     * exists in remote DOM.
     *
     * @param  String   selector   A CSS3 selector string
     * @param  String   message    Test description
     */
    this.assertSelectorExists = function(selector, message) {
        return this.assert(this.exists(selector), message);
    };

    /**
     * Asserts that title of the remote page equals to the expected one.
     *
     * @param  String  expected   The expected title string
     * @param  String  message    Test description
     */
    this.assertTitle = function(expected, message) {
        return this.assertEquals(casper.getTitle(), expected, message);
    };

    /**
     * Asserts that the provided input is of the given type.
     *
     * @param  mixed   input    The value to test
     * @param  String  type     The javascript type name
     * @param  String  message  Test description
     */
    this.assertType = function(input, type, message) {
        return this.assertEquals(utils.betterTypeOf(input), type, message);
    };

    /**
     * Asserts that a the current page url matches the provided RegExp
     * pattern.
     *
     * @param  RegExp   pattern    A RegExp object instance
     * @param  String   message    Test description
     */
    this.assertUrlMatch = function(pattern, message) {
        return this.assertMatch(casper.getCurrentUrl(), pattern, message);
    };

    this.bar = function(text, style) {
        casper.echo(utils.fillBlanks(text), style);
    };

    /**
     * Render a colorized output. Basically a proxy method for
     * Casper.Colorizer#colorize()
     */
    this.colorize = function(message, style) {
        return casper.colorizer.colorize(message, style);
    };

    /**
     * Writes a comment-style formatted message to stdout.
     *
     * @param  String  message
     */
    this.comment = function(message) {
        casper.echo('# ' + message, 'COMMENT');
    };

    /**
     * Declares the current test suite done.
     *
     */
    this.done = function() {
        this.running = false;
    };

    /**
     * Writes an error-style formatted message to stdout.
     *
     * @param  String  message
     */
    this.error = function(message) {
        casper.echo(message, 'ERROR');
    };

    /**
     * Executes a file, wraping and evaluating its code in an isolated
     * environment where only the current `casper` instance is passed.
     *
     * @param  String  file  Absolute path to some js/coffee file
     */
    this.exec = function(file) {
        file = this.filter('exec.file', file) || file;
        if (!fs.isFile(file) || !utils.isJsFile(file)) {
            throw new CasperError("Can only exec() files with .js or .coffee extensions");
        }
        this.currentTestFile = file;
        try {
            new Function('casper', phantom.getScriptCode(file))(casper);
        } catch (e) {
            var self = this;
            phantom.processScriptError(e, file, function(error) {
                // do not abort the whole suite, just fail fast displaying the
                // caught error and process next suite
                self.fail(e);
                self.done();
            });
        }
    };

    /**
     * Adds a failed test entry to the stack.
     *
     * @param  String  message
     */
    this.fail = function(message) {
        this.assert(false, message);
    };

    /**
     * Recursively finds all test files contained in a given directory.
     *
     * @param  String  dir  Path to some directory to scan
     */
    this.findTestFiles = function(dir) {
        var self = this;
        if (!fs.isDirectory(dir)) {
            return [];
        }
        var entries = fs.list(dir).filter(function(entry) {
            return entry !== '.' && entry !== '..';
        }).map(function(entry) {
            return fs.absolute(fs.pathJoin(dir, entry));
        });
        entries.forEach(function(entry) {
            if (fs.isDirectory(entry)) {
                entries = entries.concat(self.findTestFiles(entry));
            }
        });
        return entries.filter(function(entry) {
            return utils.isJsFile(fs.absolute(fs.pathJoin(dir, entry)));
        });
    };

    /**
     * Formats a message to highlight some parts of it.
     *
     * @param  String  message
     * @param  String  style
     */
    this.formatMessage = function(message, style) {
        var parts = /([a-z0-9_\.]+\(\))(.*)/i.exec(message);
        if (!parts) {
            return message;
        }
        return this.colorize(parts[1], 'PARAMETER') + this.colorize(parts[2], style);
    };

    /**
     * Writes an info-style formatted message to stdout.
     *
     * @param  String  message
     */
    this.info = function(message) {
        casper.echo(message, 'PARAMETER');
    };

    /**
     * Adds a successful test entry to the stack.
     *
     * @param  String  message
     */
    this.pass = function(message) {
        this.assert(true, message);
    };

    /**
     * Renders a detailed report for each failed test.
     *
     * @param  Array  failures
     */
    this.renderFailureDetails = function(failures) {
        if (failures.length === 0) {
            return;
        }
        casper.echo(f("\nDetails for the %d failed test%s:\n", failures.length, failures.length > 1 ? "s" : ""), "PARAMETER");
        failures.forEach(function(failure) {
            casper.echo(f('In %s:', failure.file));
            var message;
            if (utils.isType(failure.message, "object") && failure.message.stack) {
                message = failure.message.stack;
            } else {
                message = failure.message;
            }
            casper.echo(f('    %s', message), "COMMENT");
        });
    };

    /**
     * Render tests results, an optionnaly exit phantomjs.
     *
     * @param  Boolean  exit
     */
    this.renderResults = function(exit, status, save) {
        save = utils.isString(save) ? save : this.options.save;
        var total = this.testResults.passed + this.testResults.failed, statusText, style, result;
        if (total === 0) {
            statusText = FAIL;
            style = 'RED_BAR';
            result = f("%s Looks like you didn't run any test.", statusText);
        } else {
            if (this.testResults.failed > 0) {
                statusText = FAIL;
                style = 'RED_BAR';
            } else {
                statusText = PASS;
                style = 'GREEN_BAR';
            }
            result = f('%s %s tests executed, %d passed, %d failed.',
                       statusText, total, this.testResults.passed, this.testResults.failed);
        }
        casper.echo(this.colorize(utils.fillBlanks(result), style));
        if (this.testResults.failed > 0) {
            this.renderFailureDetails(this.testResults.failures);
        }
        if (save && utils.isFunction(require)) {
            try {
                fs.write(save, exporter.getXML(), 'w');
                casper.echo(f('Result log stored in %s', save), 'INFO');
            } catch (e) {
                casper.echo(f('Unable to write results to %s: %s', save, e), 'ERROR');
            }
        }
        if (exit === true) {
            casper.exit(status || 0);
        }
    };

    /**
     * Runs al suites contained in the paths passed as arguments.
     *
     */
    this.runSuites = function() {
        var testFiles = [], self = this;
        if (arguments.length === 0) {
            throw new CasperError("No test suite to run");
        }
        Array.prototype.forEach.call(arguments, function(path) {
            if (!fs.exists(path)) {
                self.bar(f("Path %s doesn't exist", path), "RED_BAR");
            }
            if (fs.isDirectory(path)) {
                testFiles = testFiles.concat(self.findTestFiles(path));
            } else if (fs.isFile(path)) {
                testFiles.push(path);
            }
        });
        if (testFiles.length === 0) {
            this.bar("No test file found, aborting.", "RED_BAR");
            casper.exit(1);
        }
        var current = 0;
        var interval = setInterval(function(self) {
            if (self.running) {
                return;
            }
            if (current === testFiles.length) {
                self.renderResults(true);
                clearInterval(interval);
            } else {
                self.runTest(testFiles[current]);
                current++;
            }
        }, 100, this);
    };

    /**
     * Runs a test file
     *
     */
    this.runTest = function(testFile) {
        this.bar(f('Test file: %s', testFile), 'INFO_BAR');
        this.running = true; // this.running is set back to false with done()
        try {
            this.exec(testFile);
        } catch (e) {
            // TODO: better formatting of aborted failing suite
            // TODO: add exception trace (?)
            this.fail(e);
            this.done();
        }
    };

    /**
     * Tests equality between the two passed arguments.
     *
     * @param  Mixed  v1
     * @param  Mixed  v2
     * @param  Boolean
     */
    this.testEquals = function(v1, v2) {
        if (utils.betterTypeOf(v1) !== utils.betterTypeOf(v2)) {
            return false;
        }
        if (utils.isFunction(v1)) {
            return v1.toString() === v2.toString();
        }
        if (v1 instanceof Object && v2 instanceof Object) {
            if (Object.keys(v1).length !== Object.keys(v2).length) {
                return false;
            }
            for (var k in v1) {
                if (!this.testEquals(v1[k], v2[k])) {
                    return false;
                }
            }
            return true;
        }
        return v1 === v2;
    };
};

// Tester class is an EventEmitter
utils.inherits(Tester, events.EventEmitter);

exports.Tester = Tester;