import { configurationValue, HttpClientFactory, HttpMethod, logger } from "@atomist/automation-client";

/**
 * Post data to an ingester webhook using httpClient from the SDM
 * @param url The url to send data to
 * @param payload Payload of data to send to the endpoint (object form; gets converted to JSON)
 * @param {Configuration} config sdm configuration
 */
export const sdmPostWebhook = async (url: string, payload: any) => {
    const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();

    try {
        const result = await httpClient.exchange(
            url, {
                method: HttpMethod.Post,
                body: JSON.stringify(payload),
                headers: { ["Content-Type"]: "application/json" },
        });
        logger.debug(`sdmPostWebhook Result: ${JSON.stringify(result)}`);

    } catch (e) {
        logger.error("sdmPostWebhook:  Error! Failed to send webhook.  Failure: " + e.message);
        throw new Error(e);
    }
};
