// eslint-disable-next-line tsdoc/syntax
/** @module WhatsAppAPI */

import type {
    PostData,
    GetParams,
    ClientMessage,
    ClientMessageBuiltin,
    ClientMessageRequest,
    ServerMessageResponse,
    ServerMarkAsReadResponse,
    ServerCreateQRResponse,
    ServerRetrieveQRResponse,
    ServerUpdateQRResponse,
    ServerDeleteQRResponse,
    ServerMediaRetrieveResponse,
    ServerMediaUploadResponse,
    ServerMediaDeleteResponse
} from "./types";
import type { OnMessageArgs, OnSentArgs, OnStatusArgs } from "./emitters";

import type { fetch as FetchType, Request, Response, FormData } from "undici";
import type { verify as VerifyType } from "node:crypto";
import type { Blob } from "node:buffer";

import EventEmitter from "node:events";

/**
 * The main API Class
 *
 * @alpha
 */
export default class WhatsAppAPI extends EventEmitter {
    //#region Properties
    /**
     * The API token
     */
    token: string;
    /**
     * The app secret
     */
    appSecret?: string;
    /**
     * The webhook verify token
     */
    webhookVerifyToken?: string;
    /**
     * The API version to use
     */
    v: string;
    /**
     * The fetch function for the requests
     */
    fetch: typeof FetchType;
    /**
     * The createHmac function for checking the signatures
     */
    verify?: typeof VerifyType;
    /**
     * If true, API operations will return the fetch promise instead. Intended for low level debugging.
     */
    parsed: boolean;
    /**
     * If false, the API will be used in a less secure way, reducing the need for appSecret. Defaults to true.
     */
    secure: boolean;
    //#endregion

    /**
     * Initiate the Whatsapp API app
     *
     * @throws If token is not defined
     * @throws If appSecret is not defined and secure is true
     * @throws If fetch is not defined in the enviroment and the provided ponyfill isn't a function
     * @throws If v is not a string
     */
    constructor({
        token,
        appSecret,
        webhookVerifyToken,
        v = "v16.0",
        parsed = true,
        secure = true,
        ponyfill = {}
    }: {
        /**
         * The API token, given at setup. It can be either a temporal token or a permanent one.
         */
        token: string;
        /**
         * The app secret, given at setup
         */
        appSecret?: string;
        /**
         * The webhook verify token, configured at setup
         */
        webhookVerifyToken?: string;
        /**
         * The version of the API, defaults to v16.0
         */
        v: string;
        /**
         * Whether to return a pre-processed response from the API or the raw fetch response. Intended for low level debugging.
         */
        parsed: boolean;
        /**
         * If set to false, none of the API checks will be performed, and the API will be used in a less secure way. Defaults to true.
         */
        secure: boolean;
        ponyfill: {
            /**
             * The fetch ponyfill to use for the requests. If not specified, it defaults to the fetch function from the enviroment.
             */
            fetch?: typeof FetchType;
            /**
             * The verify ponyfill to use for the signatures. If not specified, it defaults to the verify function from node:crypto
             */
            verify?: typeof VerifyType;
        };
    }) {
        super();

        this.token = token;
        this.secure = !!secure;

        if (this.secure) {
            if (!appSecret) {
                throw new Error(
                    "App secret must be defined if secure is true. To ignore this parameter, set secure to false (Not recommended)."
                );
            }

            this.appSecret = appSecret;

            if (typeof ponyfill.verify !== "function") {
                // Fun fact, constructors cannot be async, so the best we can do is warn the user
                // and later, when needed, import the module or throw a real error
                import("node:crypto")
                    .then((m) => {
                        if (!m.verify) {
                            console.warn(
                                "Failed to import verify from node:crypto and secure is set to true, Whatsapp.post() method will throw 500.",
                                "Please provide a valid ponyfill with the parameter 'ponyfill.verify' or set secure to false (Not recommended)."
                            );
                        } else this.verify = m.verify;
                    })
                    .catch(() => {
                        console.warn(
                            "Failed to import createHmac from node:crypto and secure is set to true, Whatsapp.post() method will throw 500.",
                            "Please provide a valid ponyfill with the parameter 'ponyfill.createHmac' or set secure to false (Not recommended)."
                        );
                    });
            }
        }

        if (webhookVerifyToken) this.webhookVerifyToken = webhookVerifyToken;

        if (
            typeof ponyfill.fetch !== "function" &&
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - fetch might not be defined in the enviroment
            typeof fetch !== "function"
        ) {
            throw new Error(
                "fetch is not defined in the enviroment, please provide a valid ponyfill function with the parameter 'ponyfill.fetch'."
            );
        }

        // Let's hope the user is using a valid ponyfill
        this.fetch =
            ponyfill.fetch ||
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - fetch might not be defined in the enviroment
            // Splitted in two lines to reduce the impact of the ts-ignore
            fetch;

        this.v = v;

        this.parsed = !!parsed;
    }

    //#region Message Operations

    /**
     * Send a Whatsapp message
     *
     * @param phoneID - The bot's phone ID
     * @param to - The user's phone number
     * @param message - A Whatsapp component, built using the corresponding module for each type of message.
     * @param context - The message ID of the message to reply to
     * @returns The server response
     */
    async sendMessage(
        phoneID: string,
        to: string,
        message: ClientMessage | ClientMessageBuiltin,
        context?: string
    ): Promise<ServerMessageResponse | Response> {
        const type = message._type;

        const request = {
            messaging_product: "whatsapp",
            type,
            to
        } as ClientMessageRequest;

        if (context) request.context = { message_id: context };

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - TS dumb, the _type will always match the type
        request[type] =
            // Prettier will probably kill me, but this comment has a purpose.
            // It prevents ts-ignore from ignoring more than intended.
            message._build();

        // Make the post request
        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${phoneID}/messages`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(request)
            }
        );

        const response = this.parsed
            ? ((await (await promise).json()) as ServerMessageResponse)
            : undefined;

        const args: OnSentArgs = {
            phoneID,
            to,
            type,
            message,
            request,
            id: response
                ? "messages" in response
                    ? response.messages[0].id
                    : undefined
                : undefined,
            response: response ? response : undefined
        };

        this.emit("sent", args);

        return response ?? promise;
    }

    /**
     * Mark a message as read
     *
     * @param phoneID - The bot's phone ID
     * @param messageId - The message ID
     * @returns The server response
     */
    async markAsRead(
        phoneID: string,
        messageId: string
    ): Promise<ServerMarkAsReadResponse | Response> {
        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${phoneID}/messages`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    status: "read",
                    messageId
                })
            }
        );

        return this.parsed
            ? ((await (await promise).json()) as ServerMarkAsReadResponse)
            : promise;
    }

    //#endregion

    //#region QR Operations

    /**
     * Generate a QR code for sharing the bot
     *
     * @param phoneID - The bot's phone ID
     * @param message - The quick message on the QR code
     * @param format - The format of the QR code
     * @returns The server response
     */
    async createQR(
        phoneID: string,
        message: string,
        format: "png" | "svg" = "png"
    ): Promise<ServerCreateQRResponse | Response> {
        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${phoneID}/message_qrdls?generate_qr_image=${format}&prefilled_message=${message}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }
        );

        return this.parsed
            ? ((await (await promise).json()) as ServerCreateQRResponse)
            : promise;
    }

    /**
     * Get one or many QR codes of the bot
     *
     * @param phoneID - The bot's phone ID
     * @param id - The QR's id to find. If not specified, all QRs will be returned
     * @returns The server response
     */
    async retrieveQR(
        phoneID: string,
        id?: string
    ): Promise<ServerRetrieveQRResponse | Response> {
        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${phoneID}/message_qrdls/${
                id ?? ""
            }`,
            {
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }
        );

        return this.parsed
            ? ((await (await promise).json()) as ServerRetrieveQRResponse)
            : promise;
    }

    /**
     * Update a QR code of the bot
     *
     * @param phoneID - The bot's phone ID
     * @param id - The QR's id to edit
     * @param message - The new quick message for the QR code
     * @returns The server response
     */
    async updateQR(
        phoneID: string,
        id: string,
        message: string
    ): Promise<ServerUpdateQRResponse | Response> {
        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${phoneID}/message_qrdls/${id}?prefilled_message=${message}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }
        );

        return this.parsed
            ? ((await (await promise).json()) as ServerUpdateQRResponse)
            : promise;
    }

    /**
     * Delete a QR code of the bot
     *
     * @param phoneID - The bot's phone ID
     * @param id - The QR's id to delete
     * @returns The server response
     */
    async deleteQR(
        phoneID: string,
        id: string
    ): Promise<ServerDeleteQRResponse | Response> {
        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${phoneID}/message_qrdls/${id}`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }
        );

        return this.parsed
            ? ((await (await promise).json()) as ServerDeleteQRResponse)
            : promise;
    }

    //#endregion

    //#region Media Operations

    /**
     * Get a Media object data with an ID
     *
     * @param id - The Media's ID
     * @param phoneID - Business phone number ID. If included, the operation will only be processed if the ID matches the ID of the business phone number that the media was uploaded on.
     * @returns The server response
     */
    async retrieveMedia(
        id: string,
        phoneID?: string
    ): Promise<ServerMediaRetrieveResponse | Response> {
        const params = phoneID ? `phone_number_id=${phoneID}` : "";
        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${id}?${params}`,
            {
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }
        );

        return this.parsed
            ? ((await (
                  await promise
              ).json()) as Promise<ServerMediaRetrieveResponse>)
            : promise;
    }

    /**
     * Upload a Media to the server
     *
     * @param phoneID - The bot's phone ID
     * @param form - The Media's FormData. Must have a 'file' property with the file to upload as a blob and a valid mime-type in the 'type' field of the blob. Example for Node ^18: new FormData().set("file", new Blob([stringOrFileBuffer], "image/png")); Previous versions of Node will need an external FormData, such as undici's. To use non spec complaints versions of FormData (eg: form-data) or Blob set the 'check' parameter to false.
     * @param check - If the FormData should be checked before uploading. The FormData must have the method .get("name") to work with the checks. If it doesn't (for example, using the module "form-data"), set this to false.
     * @returns The server response
     * @throws If check is set to true and form is not a FormData
     * @throws If check is set to true and the form doesn't have valid required properties (file, type)
     * @throws If check is set to true and the form file is too big for the file type
     * @example
     * import WhatsAppAPI from "whatsapp-api-js";
     *
     * const token = "token";
     * const appSecret = "appSecret";
     *
     * const Whatsapp = new WhatsAppAPI(\{ token, appSecret \});
     *
     * // If required:
     * // import FormData from "undici";
     * // import \{ Blob \} from "node:buffer";
     *
     * const form = new FormData();
     *
     * // If you don't mind reading the whole file into memory:
     * form.set("file", new Blob([fs.readFileSync("image.png")], "image/png"));
     *
     * // If you do, you will need to use streams. The module "form-data",
     * // although not spec compliant (hence needing to set check to false),
     * // has an easy way to do this:
     * // form.append("file", fs.createReadStream("image.png"), \{ contentType: "image/png" \});
     *
     * console.log(await Whatsapp.uploadMedia("phoneID", form));
     * // Expected output: \{ id: "mediaID" \}
     */
    async uploadMedia(
        phoneID: string,
        form: unknown,
        check = true
    ): Promise<ServerMediaUploadResponse | Response> {
        if (check) {
            if (
                !form ||
                typeof form !== "object" ||
                !("get" in form) ||
                typeof form.get !== "function"
            )
                throw new TypeError(
                    "File's Form must be an instance of FormData"
                );

            const file = form.get("file") as Blob;

            if (!file.type)
                throw new Error("File's Blob must have a type specified");

            const validMediaTypes = [
                "audio/aac",
                "audio/mp4",
                "audio/mpeg",
                "audio/amr",
                "audio/ogg",
                "text/plain",
                "application/pdf",
                "application/vnd.ms-powerpoint",
                "application/msword",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "image/jpeg",
                "image/png",
                "video/mp4",
                "video/3gp",
                "image/webp"
            ];

            if (!validMediaTypes.includes(file.type))
                throw new Error(`Invalid media type: ${file.type}`);

            const validMediaSizes = {
                audio: 16_000_000,
                text: 100_000_000,
                application: 100_000_000,
                image: 5_000_000,
                video: 16_000_000,
                sticker: 500_000
            };

            const mediaType =
                file.type === "image/webp"
                    ? "sticker"
                    : (file.type.split("/")[0] as keyof typeof validMediaSizes);

            if (!(mediaType in validMediaSizes))
                throw new Error(`Invalid media type: ${file.type}`);

            if (file.size && file.size > validMediaSizes[mediaType])
                throw new Error(
                    `File is too big (${file.size} bytes) for a ${mediaType} (${validMediaSizes[mediaType]} bytes limit)`
                );
        }

        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${phoneID}/media?messaging_product=whatsapp`,
            {
                method: "POST",
                body: form as FormData,
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "multipart/form-data"
                }
            }
        );

        return this.parsed
            ? ((await (await promise).json()) as ServerMediaUploadResponse)
            : promise;
    }

    /**
     * Get a Media fetch from an url.
     * When using this method, be sure to pass a trusted url, since the request will be authenticated with the token.
     *
     * @param url - The Media's url
     * @returns The fetch raw response
     * @throws If url is not a valid url
     * @example
     * import WhatsAppAPI from "whatsapp-api-js";
     *
     * const token = "token";
     * const appSecret = "appSecret";
     *
     * const Whatsapp = new WhatsAppAPI(\{ token, appSecret \});
     *
     * const id = "mediaID";
     * const \{ url \} = await Whatsapp.retrieveMedia(id);
     * const response = Whatsapp.fetchMedia(url);
     */
    fetchMedia(url: string): Promise<Response> {
        // Hacky way to check if the url is valid and throw if invalid
        return this._authenicatedRequest(new URL(url));
    }

    /**
     * Delete a Media object with an ID
     *
     * @param id - The Media's ID
     * @param phoneID - Business phone number ID. If included, the operation will only be processed if the ID matches the ID of the business phone number that the media was uploaded on.
     * @returns The server response
     */
    async deleteMedia(
        id: string,
        phoneID?: string
    ): Promise<ServerMediaDeleteResponse | Response> {
        const params = phoneID ? `phone_number_id=${phoneID}` : "";
        const promise = this.fetch(
            `https://graph.facebook.com/${this.v}/${id}?${params}`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }
        );

        return this.parsed
            ? ((await (await promise).json()) as ServerMediaDeleteResponse)
            : promise;
    }

    // #endregion

    // #region Webhooks

    /**
     * POST helper, must be called inside the post function of your code.
     * When setting up the webhook, only subscribe to messages. Other subscritions support might be added later.
     *
     * @param data - The POSTed data object sent by Whatsapp
     * @param raw_body - The raw body of the POST request
     * @param signature - The X-Hub-Signature-256 header signature sent by Whatsapp
     * @returns 200, it's the expected http/s response code
     * @throws 500 if secure and the appSecret isn't specified
     * @throws 501 if secure and node:crypto verify method or ponyfill isn't available
     * @throws 400 if secure and the rawBody is missing
     * @throws 401 if secure and the signature is missing
     * @throws 401 if secure and the signature doesn't match the hash
     * @throws 400 if the POSTed data is not a valid Whatsapp API request
     */
    post(data: PostData, raw_body?: string, signature?: string): number {
        //Validating the payload
        if (this.secure) {
            if (!this.appSecret) throw 500;
            if (!this.verify) throw 501;

            if (!raw_body) throw 400;
            if (!signature) throw 401;

            const raw_body_buffer = Buffer.from(raw_body, "utf8");
            const signature_buffer = Buffer.from(signature.split("=")[1]);

            const match = this.verify(
                "sha256",
                raw_body_buffer,
                this.appSecret,
                signature_buffer
            );

            if (!match) throw 401;
        }

        // Throw "400 Bad Request" if data is not a valid WhatsApp API request
        if (!data.object) throw 400;

        const value = data.entry[0].changes[0].value;
        const phoneID = value.metadata.phone_number_id;

        // Check if the message is a message or a status update
        if ("messages" in value) {
            const contact = value.contacts[0];

            const from = contact.wa_id;
            const name = contact.profile.name;

            const message = value.messages[0];

            const args: OnMessageArgs = {
                phoneID,
                from,
                message,
                name,
                raw: data
            };

            this.emit("message", args);
        } else if ("statuses" in value) {
            const statuses = value.statuses[0];

            const phone = statuses.recipient_id;
            const status = statuses.status;
            const id = statuses.id;
            const conversation = statuses.conversation;
            const pricing = statuses.pricing;
            const error = statuses.errors?.[0];

            const args: OnStatusArgs = {
                phoneID,
                phone,
                status,
                id,
                conversation,
                pricing,
                error,
                raw: data
            };

            this.emit("status", args);
        }
        // If unknown payload, just ignore it
        // Facebook doesn't care about your server's opinion

        return 200;
    }

    /**
     * GET helper, must be called inside the get function of your code.
     * Used once at the first webhook setup.
     *
     * @param params - The request object sent by Whatsapp
     * @returns The challenge string, it must be the http response body
     * @throws 500 if webhookVerifyToken is not specified
     * @throws 400 if the request is missing data
     * @throws 403 if the verification tokens don't match
     */
    get(params: GetParams): string {
        if (!this.webhookVerifyToken) throw 500;

        // Parse params from the webhook verification request
        const {
            "hub.mode": mode,
            "hub.verify_token": token,
            "hub.challenge": challenge
        } = params;

        // Check if a token and mode were sent
        if (!mode || !token) {
            // Responds with "400 Bad Request" if it's missing data
            throw 400;
        }

        // Check the mode and token sent are correct
        if (mode === "subscribe" && token === this.webhookVerifyToken) {
            // Respond with 200 OK and challenge token from the request
            return challenge;
        }

        // Responds with "403 Forbidden" if verify tokens do not match
        throw 403;
    }

    // #endregion

    /**
     * Make an authenticated request to any url.
     * When using this method, be sure to pass a trusted url, since the request will be authenticated with the token.
     *
     * @internal
     * @param url - The url to request to
     * @returns The fetch response
     * @throws If url is not specified
     */
    _authenicatedRequest(url: string | URL | Request): Promise<Response> {
        if (!url) throw new Error("URL must be specified");

        return this.fetch(url, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });
    }
}
