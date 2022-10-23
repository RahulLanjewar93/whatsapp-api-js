// @ts-//nocheck

// Unit tests with mocha and sinon
const assert = require('assert');
const sinon = require('sinon');

// Mock the https requests
// const nock = require('nock');
// nock.disableNetConnect();
// const api = nock("https://graph.facebook.com");

// Mock the https requests
const { agent, client } = require('./server.mocks');
const { setGlobalDispatcher } = require('undici');
setGlobalDispatcher(agent);

// Import the module
const { WhatsAppAPI, Types } = require('../index');
const { Text } = Types;

// Import mocks
const { Request } = require('../fetch');

// Polyfill FormData and Blob
const formdata = typeof FormData !== "undefined" ? FormData : require("undici").FormData;
const blob = typeof Blob !== "undefined" ? Blob : require("node:buffer").Blob;

describe("WhatsAppAPI", function() {
    describe("Token", function() {
        it("should create a WhatsAppAPI object with the token", function() {
            const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN");
            assert.equal(Whatsapp.token, "YOUR_ACCESS_TOKEN");
        });

        it("should fail if no access token is provided", function() {
            assert.throws(function() {
                const Whatsapp = new WhatsAppAPI();
            });
        });
    });

    describe("Version", function() {
        it("should work with v15.0 as default", function() {
            const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN");
            assert.equal(Whatsapp.v, "v15.0");
        });

        it("should work with any specified version", function() {
            const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN", "v13.0");
            assert.equal(Whatsapp.v, "v13.0");
        });
    });
    
    describe("Parsed", function() {
        it("should set parsed to true by default", function() {
            const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN");
            assert.equal(Whatsapp.parsed, true);
        });
    
        it("should be able to set parsed to true", function() {
            const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN", "v13.0", true);
            assert.equal(Whatsapp.parsed, true);
        });

        it("should be able to set parsed to false", function() {
            const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN", "v13.0", false);
            assert.equal(Whatsapp.parsed, false);
        });
    });

    describe("Logger", function() {
        const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN");

        this.beforeEach(function() {
            Whatsapp.parsed = true;
        });

        const bot = "1";
        const user = "2";
        const message = new Text("3");
        const request = new Request(message, user);

        const id = "4";
        const expectedResponse = {
            messaging_product: "whatsapp",
            contacts: [
                {
                    input: user,
                    wa_id: user
                }
            ],
            messages: [
                {
                    id
                }
            ]
        }
        
        const apiValidObject = { ...message };
        delete apiValidObject._;
        
        it("should set the logger if truthy and is a function", function() {
            const logger = console.log;
            Whatsapp.logSentMessages(logger);
            assert.equal(Whatsapp._register, logger);
        });

        it("should unset the logger if no parameters is given", function() {
            Whatsapp.logSentMessages(console.log).logSentMessages();
            assert.equal(typeof Whatsapp._register, "function");
        });

        it("should fail if the logger is not a function", function() {
            assert.throws(function() {
                Whatsapp.logSentMessages(0);
            }, TypeError);

            assert.throws(function() {
                Whatsapp.logSentMessages(true);
            }, TypeError);

            assert.throws(function() {
                Whatsapp.logSentMessages({});
            }, TypeError);
        });

        it("should run the logger after sending a message if the logger is truthy", async function() {
            const spy = sinon.spy();

            Whatsapp.logSentMessages(spy);

            client.intercept({
                path: `/${Whatsapp.v}/${bot}/messages`,
                method: 'POST',
            }).reply(200, expectedResponse).times(1);

            await Whatsapp.sendMessage(bot, user, message);
            
            sinon.assert.calledOnceWithMatch(spy, bot, user, apiValidObject, request, id, expectedResponse);
        });

        it("should handle failed deliveries responses", async function() {
            const spy = sinon.spy();

            Whatsapp.logSentMessages(spy);

            const unexpectedResponse = {
                error: {
                    message: 'Invalid OAuth access token - Cannot parse access token',
                    type: 'OAuthException',
                    code: 190,
                    fbtrace_id: 'Azr7Sq738VC5zzOnPvZzPwj'
                }
            }

            client.intercept({
                path: `/${Whatsapp.v}/${bot}/messages`,
                method: 'POST',
            }).reply(200, unexpectedResponse).times(1);

            await Whatsapp.sendMessage(bot, user, message);
            
            sinon.assert.calledOnceWithMatch(spy, bot, user, apiValidObject, request, undefined, unexpectedResponse);
        });

        it("should run the logger with id and response as undefined if parsed is set to false", function() {
            Whatsapp.parsed = false;
            
            const spy = sinon.spy();

            Whatsapp.logSentMessages(spy);

            Whatsapp.sendMessage(bot, user, message);
            
            sinon.assert.calledOnceWithMatch(spy, bot, user, apiValidObject, request);
        });
    });
    
    describe("Message", function() {
        const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN");

        this.beforeEach(function() {
            Whatsapp.parsed = true;
        });

        describe("Send", function() {
            const bot = "1";
            const user = "2";
            const id = "something_random";
            const message = new Text("Hello world");

            it("should be able to send a basic message", async function() {
                const expectedResponse = {
                    messaging_product: "whatsapp",
                    contacts: [
                        {
                            input: user,
                            wa_id: user,
                        }
                    ],
                    messages: [
                        {
                            id,
                        },
                    ],
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/messages`,
                    method: 'POST',
                    body: JSON.stringify(new Request(message, user)),
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.sendMessage(bot, user, message);

                assert.deepEqual(response, expectedResponse);
            });

            it("should be able to send a reply message (context)", async function() {
                const context = "another_random_id";

                const expectedResponse = {
                    messaging_product: "whatsapp",
                    contacts: [
                        {
                            input: user,
                            wa_id: user,
                        }
                    ],
                    messages: [
                        {
                            id,
                        },
                    ],
                };
                
                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/messages`,
                    method: 'POST',
                    body: JSON.stringify(new Request(message, user, context)),
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.sendMessage(bot, user, message, context);

                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the phoneID param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.sendMessage(undefined, user, message);
                });

                assert.throws(function() {
                    Whatsapp.sendMessage(false, user, message);
                });

                assert.throws(function() {
                    Whatsapp.sendMessage();
                });
            });

            it("should fail if the phone param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.sendMessage(bot, undefined, message);
                });

                assert.throws(function() {
                    Whatsapp.sendMessage(bot, false, message);
                });

                assert.throws(function() {
                    Whatsapp.sendMessage(bot);
                });
            });

            it("should fail if the object param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.sendMessage(bot, user, undefined);
                });

                assert.throws(function() {
                    Whatsapp.sendMessage(bot, user, false);
                });

                assert.throws(function() {
                    Whatsapp.sendMessage(bot, user);
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const expectedResponse = {
                    messaging_product: "whatsapp",
                    contacts: [
                        {
                            input: user,
                            wa_id: user,
                        }
                    ],
                    messages: [
                        {
                            id,
                        },
                    ],
                };
                
                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/messages`,
                    method: 'POST',
                    body: JSON.stringify(new Request(message, user)),
                }).reply(200, expectedResponse).times(1);

                const response = await (await Whatsapp.sendMessage(bot, user, message)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });

        describe("Mark as read", function() {
            it("should be able to mark a message as read", async function() {
                const bot = "1";
                const id = "2";

                const expectedResponse = {
                    success: true
                };
                
                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/messages`,
                    method: 'POST',
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        status: "read",
                        message_id: id,
                    }),
                }).reply(200, expectedResponse).times(1);
                
                const response = await Whatsapp.markAsRead(bot, id);

                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the phoneID param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.markAsRead(undefined, "2");
                });

                assert.throws(function() {
                    Whatsapp.markAsRead(false, "2");
                });

                assert.throws(function() {
                    Whatsapp.markAsRead();
                });
            });

            it("should fail if the id param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.markAsRead("1", undefined);
                });

                assert.throws(function() {
                    Whatsapp.markAsRead("1", false);
                });

                assert.throws(function() {
                    Whatsapp.markAsRead("1");
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const bot = "1";
                const id = "2";

                const expectedResponse = {
                    success: true
                };
                
                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/messages`,
                    method: 'POST',
                }).reply(200, expectedResponse).times(1);
                
                const response = await (await Whatsapp.markAsRead(bot, id)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });
    });

    describe("QR", function() {
        const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN");

        this.beforeEach(function() {
            Whatsapp.parsed = true;
        });

        const bot = "1";
        const message = "Hello World";
        const code = "something_random";

        describe("Create", function() {
            it("should be able to create a QR code as a png (default)", async function() {
                const format = "png";

                const expectedResponse = {
                    code,
                    prefilled_message: message,
                    deep_link_url: `https://wa.me/message/${code}`,
                    qr_image_url: 'https://scontent.faep22-1.fna.fbcdn.net/m1/v/t6/another_weird_url',
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls`,
                    method: 'POST',
                    query: {
                        generate_qr_image: format,
                        prefilled_message: message,
                    },
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.createQR(bot, message);
    
                assert.deepEqual(response, expectedResponse);
            });

            it("should be able to create a QR as a png", async function() {
                const format = "png";

                const expectedResponse = {
                    code,
                    prefilled_message: message,
                    deep_link_url: `https://wa.me/message/${code}`,
                    qr_image_url: 'https://scontent.faep22-1.fna.fbcdn.net/m1/v/t6/another_weird_url',
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls`,
                    method: 'POST',
                    query: {
                        generate_qr_image: format,
                        prefilled_message: message,
                    },
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.createQR(bot, message, format);
    
                assert.deepEqual(response, expectedResponse);
            });

            it("should be able to create a QR as a svg", async function() {
                const format = "svg";

                const expectedResponse = {
                    code,
                    prefilled_message: message,
                    deep_link_url: `https://wa.me/message/${code}`,
                    qr_image_url: 'https://scontent.faep22-1.fna.fbcdn.net/m1/v/t6/another_weird_url',
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls`,
                    method: 'POST',
                    query: {
                        generate_qr_image: format,
                        prefilled_message: message,
                    },
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.createQR(bot, message, format);
    
                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the phoneID param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.createQR(undefined, message);
                });

                assert.throws(function() {
                    Whatsapp.createQR(false, message);
                });

                assert.throws(function() {
                    Whatsapp.createQR();
                });
            });

            it("should fail if the message param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.createQR(bot, undefined);
                });

                assert.throws(function() {
                    Whatsapp.createQR(bot, false);
                });

                assert.throws(function() {
                    Whatsapp.createQR(bot);
                });
            });
            
            it("should fail with an invalid format type", function() {
                const format = "jpg";

                assert.throws(function() {
                    Whatsapp.createQR(bot, message, format);
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const format = "png";

                const expectedResponse = {
                    code,
                    prefilled_message: message,
                    deep_link_url: `https://wa.me/message/${code}`,
                    qr_image_url: 'https://scontent.faep22-1.fna.fbcdn.net/m1/v/t6/another_weird_url',
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls`,
                    method: 'POST',
                    query: {
                        generate_qr_image: format,
                        prefilled_message: message,
                    },
                }).reply(200, expectedResponse).times(1);
    
                const response = await (await Whatsapp.createQR(bot, message)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });

        describe("Retrieve", function() {
            it("should retrieve all QR codes if code is undefined", async function() {
                const expectedResponse = {
                    data: [
                        {
                            code,
                            prefilled_message: message,
                            deep_link_url: `https://wa.me/message/${code}`,
                        },
                    ],
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls/`,
                    method: 'GET',
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.retrieveQR(bot);

                assert.deepEqual(response, expectedResponse);
            });

            it("should be able to retrieve a single QR code", async function() {
                const expectedResponse = {
                    data: [
                        {
                            code,
                            prefilled_message: message,
                            deep_link_url: `https://wa.me/message/${code}`,
                        }
                    ]
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls/${code}`,
                    method: 'GET',
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.retrieveQR(bot, code);

                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the phoneID param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.retrieveQR(undefined, code);
                });

                assert.throws(function() {
                    Whatsapp.retrieveQR(false, code);
                });

                assert.throws(function() {
                    Whatsapp.retrieveQR();
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const expectedResponse = {
                    data: [
                        {
                            code,
                            prefilled_message: message,
                            deep_link_url: `https://wa.me/message/${code}`,
                        }
                    ]
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls/`,
                    method: 'GET',
                }).reply(200, expectedResponse).times(1);
    
                const response = await (await Whatsapp.retrieveQR(bot)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });

        describe("Update", function() {
            const new_message = "Hello World 2";

            it("should be able to update a QR code", async function() {
                const expectedResponse = {
                    code,
                    prefilled_message: new_message,
                    deep_link_url: `https://wa.me/message/${code}`,
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls/${code}`,
                    method: 'POST',
                    query: {
                        prefilled_message: new_message,
                    },
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.updateQR(bot, code, new_message);
    
                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the phoneID param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.updateQR(undefined, code, new_message);
                });

                assert.throws(function() {
                    Whatsapp.updateQR(false, code, new_message);
                });

                assert.throws(function() {
                    Whatsapp.updateQR();
                });
            });

            it("should fail if the code param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.updateQR(bot, undefined, new_message);
                });

                assert.throws(function() {
                    Whatsapp.updateQR(bot, false, new_message);
                });

                assert.throws(function() {
                    Whatsapp.updateQR(bot);
                });
            });

            it("should fail if the message param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.updateQR(bot, code, undefined);
                });

                assert.throws(function() {
                    Whatsapp.updateQR(bot, code, false);
                });

                assert.throws(function() {
                    Whatsapp.updateQR(bot, code);
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const expectedResponse = {
                    code,
                    prefilled_message: new_message,
                    deep_link_url: `https://wa.me/message/${code}`,
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls/${code}`,
                    method: 'POST',
                    query: {
                        prefilled_message: new_message,
                    },
                }).reply(200, expectedResponse).times(1);
    
                const response = await (await Whatsapp.updateQR(bot, code, new_message)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });

        describe("Delete", function() {
            it("should be able to delete a QR code", async function() {
                const expectedResponse = {
                    success: true,
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls/${code}`,
                    method: 'DELETE',
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.deleteQR(bot, code);
    
                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the phoneID param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.deleteQR(undefined, code);
                });

                assert.throws(function() {
                    Whatsapp.deleteQR(false, code);
                });

                assert.throws(function() {
                    Whatsapp.deleteQR();
                });
            });

            it("should fail if the code param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.deleteQR(bot, undefined);
                });

                assert.throws(function() {
                    Whatsapp.deleteQR(bot, false);
                });

                assert.throws(function() {
                    Whatsapp.deleteQR(bot);
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const expectedResponse = {
                    success: true,
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/message_qrdls/${code}`,
                    method: 'DELETE',
                }).reply(200, expectedResponse).times(1);
    
                const response = await (await Whatsapp.deleteQR(bot, code)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });
    });

    describe("Media", function() {
        const Whatsapp = new WhatsAppAPI("YOUR_ACCESS_TOKEN");

        let form;
        this.beforeEach(function() {
            Whatsapp.parsed = true;
            form = new formdata();
        });

        const bot = "1";
        const id = "2";

        describe("Upload", function() {
            it("should upload a file", async function() {
                const expectedResponse = { id };

                form.append("file", new blob(["Hello World"], { type: "text/plain" }));

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/media`,
                    method: 'POST',
                    // body: form,
                    query: {
                        messaging_product: "whatsapp",
                    },
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.uploadMedia(bot, form);

                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the phoneID param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.uploadMedia(undefined, form);
                });

                assert.throws(function() {
                    Whatsapp.uploadMedia(false, form);
                });

                assert.throws(function() {
                    Whatsapp.uploadMedia();
                });
            });

            it("should fail if the form param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.uploadMedia(bot, undefined);
                });

                assert.throws(function() {
                    Whatsapp.uploadMedia(bot, false);
                });

                assert.throws(function() {
                    Whatsapp.uploadMedia(bot);
                });
            });

            describe("Check truthy (default)", function() {
                it("should fail if the form param is not a FormData instance", function() {
                    assert.throws(function() {
                        Whatsapp.uploadMedia(bot, {});
                    });
    
                    assert.throws(function() {
                        Whatsapp.uploadMedia(bot, []);
                    });
    
                    assert.throws(function() {
                        Whatsapp.uploadMedia(bot, "Hello World");
                    });
                });

                it("should fail if the form param does not contain a file", function() {
                    assert.throws(function() {
                        Whatsapp.uploadMedia(bot, new formdata());
                    });
                });

                it("should fail if the form param contains a file with no type", function() {
                    form.append("file", new blob(["Hello World"]));

                    assert.throws(function() {
                        Whatsapp.uploadMedia(bot, form);
                    });
                });

                it("should fail if the file type is invalid", function() {
                    form.append("file", new blob(["Not a real SVG"], { type: "image/svg" }));
    
                    assert.throws(function() {
                        Whatsapp.uploadMedia(bot, form);
                    });
                });

                it("should fail if the file size is too big for the format", function() {
                    const str = "I only need 500.000 chars";
                    form.append("file", new blob([str.repeat(Math.round(501_000 / str.length))], { type: "image/webp" }));
    
                    assert.throws(function() {
                        Whatsapp.uploadMedia(bot, form);
                    });
                });
            });

            describe("Check falsy", function() {
                it("should not fail if the form param is not a FormData instance", function() {
                    client.intercept({
                        path: `/${Whatsapp.v}/${bot}/media`,
                        method: 'POST',
                        body: form,
                        query: {
                            messaging_product: "whatsapp",
                        },
                    }).reply(200).times(3);
    
                    assert.doesNotThrow(function() {
                        Whatsapp.uploadMedia(bot, {}, false);
                    });
    
                    assert.doesNotThrow(function() {
                        Whatsapp.uploadMedia(bot, [], false);
                    });
    
                    assert.doesNotThrow(function() {
                        Whatsapp.uploadMedia(bot, "Hello World", false);
                    });
                });
    
                it("should not fail if the file type is invalid", function() {
                    form.append("file", new blob(["Not a real SVG"], { type: "image/svg" }));
    
                    client.intercept({
                        path: `/${Whatsapp.v}/${bot}/media`,
                        method: 'POST',
                        body: form,
                        query: {
                            messaging_product: "whatsapp",
                        },
                    }).reply(200).times(1);
    
                    assert.doesNotThrow(function() {
                        Whatsapp.uploadMedia(bot, form, false);
                    });
                });
    
                it("should not fail if the file size is too big for the format", function() {
                    const str = "I only need 500.000 chars";
                    form.append("file", new blob([str.repeat(Math.round(501_000 / str.length))], { type: "image/webp" }));
    
                    client.intercept({
                        path: `/${Whatsapp.v}/${bot}/media`,
                        method: 'POST',
                        body: form,
                        query: {
                            messaging_product: "whatsapp",
                        },
                    }).reply(200).times(1);
    
                    assert.doesNotThrow(function() {
                        Whatsapp.uploadMedia(bot, form, false);
                    });
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const expectedResponse = { id };

                form.append("file", new blob(["Hello World"], { type: "text/plain" }));

                client.intercept({
                    path: `/${Whatsapp.v}/${bot}/media`,
                    method: 'POST',
                    // body: form,
                    query: {
                        messaging_product: "whatsapp",
                    },    
                }).reply(200, expectedResponse).times(1);    

                const response = await (await Whatsapp.uploadMedia(bot, form)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });

        describe("Retrieve", function() {
            it("should retrieve a file data", async function() {
                const expectedResponse = {
                    messaging_product: "whatsapp",
                    url: "URL",
                    mime_type: "image/jpeg",
                    sha256: "HASH",
                    file_size: "SIZE",
                    id,
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${id}`,
                }).reply(200, expectedResponse).times(1);

                const response = await Whatsapp.retrieveMedia(id);

                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the id param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.retrieveMedia(undefined);
                });

                assert.throws(function() {
                    Whatsapp.retrieveMedia(false);
                });

                assert.throws(function() {
                    Whatsapp.retrieveMedia();
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const expectedResponse = {
                    messaging_product: "whatsapp",
                    url: "URL",
                    mime_type: "image/jpeg",
                    sha256: "HASH",
                    file_size: "SIZE",
                    id,
                };

                client.intercept({
                    path: `/${Whatsapp.v}/${id}`,
                }).reply(200, expectedResponse).times(1);

                const response = await (await Whatsapp.retrieveMedia(id)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });

        describe("Delete", function() {
            it("should be able to delete a QR code", async function() {
                const expectedResponse = {
                    success: true,
                };

                api.delete(`/${Whatsapp.v}/${bot}/message_qrdls/${code}`).once().reply(200, expectedResponse);

                const response = await Whatsapp.deleteQR(bot, code);
    
                assert.deepEqual(response, expectedResponse);
            });

            it("should fail if the phoneID param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.deleteQR(undefined, code);
                });

                assert.throws(function() {
                    Whatsapp.deleteQR(false, code);
                });

                assert.throws(function() {
                    Whatsapp.deleteQR();
                });
            });

            it("should fail if the code param is falsy", function() {
                assert.throws(function() {
                    Whatsapp.deleteQR(bot, undefined);
                });

                assert.throws(function() {
                    Whatsapp.deleteQR(bot, false);
                });

                assert.throws(function() {
                    Whatsapp.deleteQR(bot);
                });
            });

            it("should return the raw fetch response if parsed is false", async function() {
                Whatsapp.parsed = false;

                const expectedResponse = {
                    success: true,
                };

                api.delete(`/${Whatsapp.v}/${bot}/message_qrdls/${code}`).once().reply(200, expectedResponse);
    
                const response = await (await Whatsapp.deleteQR(bot, code)).json();

                assert.deepEqual(response, expectedResponse);
            });
        });
    });
});
