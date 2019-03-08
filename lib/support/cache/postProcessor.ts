/**
 * Post-processor that creates a customizer which exposes a /jiracache endpoint on the SDM that can be used to view cache stats,
 * or optionally flush the case
 *
 * Endpoints:
 *  /jiracache (GET)
 *      - Returns an object with the cache statistics (node-cache)
 *
 *  /jiracache/purge (POST)
 *      - Flush the cache
 *      - Must send authentication
 *          * {"auth": "<the API key in your SDM configuration>"}
 *      - Returns
 *          * {success: boolean, [error: string]}
 *
 * @param {Configuration} config sdm configuration
 * @returns {Configuration} config
 */
import {Configuration} from "@atomist/automation-client";
import {flushCache, getStats} from "./manage";

export const jiraCacheProcessor = async (config: Configuration) => {
    config.http.customizers.push(
        c => {
            c.get("/jiracache", async (req, res) => {
                res.send(await getStats());
            });

            c.post("/jiracache/purge", async (req, res) => {
                if (req.body.hasOwnProperty("auth")) {
                    try {
                        if (req.body.auth === config.apiKey) {
                            await flushCache();
                            res.send({success: true});
                        }
                    } catch (e) {
                        res.send({success: false, error: e});
                    }
                } else {
                    res.send({success: false, error: "Must supply authentication (API Key for this SDM)"});
                }
            });
        },
    );

    return config;
};
