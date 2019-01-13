import { Configuration, configurationValue, HttpClientFactory, HttpMethod, logger } from "@atomist/automation-client";

interface Ingester {
    root_type: string;
    url: string;
}
interface Registration {
    name: string;
    ingesters: Ingester[];
}
interface RegObject {
    registration: Registration;
}

/**
 * Retrieves the Ingester Webhook URL for a given ingester name/definition
 * @param {string} rootType the name of the ingester you want to retrieve the webhook url for
 * @param {RegObject[]} reg an array of SDM registrations retrieved from the registration API endpoint
 * @param {Configuration} config SDM configuration
 * @return {string} The URL to use when posting data to a given ingester
 */
const parseRegForIngesterWebhook = async (
  rootType: string,
  reg: RegObject[],
): Promise<string> => {
  // Get my registration
  const mySdm = reg.filter(r => {
      return r.registration.name === configurationValue<string>("name");
  });

  let ingesterUrl: string;
  mySdm.forEach(r => {
    const jiraIng = r.registration.ingesters.filter(i => i.root_type === rootType);
    if (jiraIng.length > 0) {
      logger.debug(`parseRegIngesterWebhook: found matching ingester!`);
      ingesterUrl = jiraIng[0].url;
    } else {
        throw new Error(`parseRegIngesterWebhook: Cannot find ingester for ${rootType}`);
    }
  });

  logger.debug(`parseRegIngesterWebhook: Ingester URL ${ingesterUrl}`);
  return ingesterUrl;
};

/**
 * Determines the Webhook URL for a given ingester
 * @param {Configuration} config
 * @param rootType the name of the ingester you want to retrieve the webhook url for
 * @return {string} The URL to use for posting data for a given ingester
 */
export const getIngesterWebhookUrl = async (rootType: string): Promise<string> => {
    const apiEndpoint = configurationValue<string>("endpoints.api");
    const apiKey = configurationValue<string>("apiKey");
    const httpClient = configurationValue<HttpClientFactory>("http.client.factory").create();
    logger.debug(`Starting  getIntegesterWebhookUrl, using URL ${apiEndpoint}`);
    try {
        const authorization = `Bearer ${apiKey}`;
        const result = await httpClient.exchange(apiEndpoint, {
                method: HttpMethod.Get,
                headers: { Authorization: authorization },
        });
        return await parseRegForIngesterWebhook(rootType, result.body as RegObject[]);
    } catch (e) {
        logger.error("getIngesterWebhookUrl: Error! Failed to retrieve data. Failure: " + e.message);
        throw new Error(e);
    }
};
