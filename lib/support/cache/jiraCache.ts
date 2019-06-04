export interface JiraCacheStats {
    hits: number;
    misses: number;
    keys: number;
    ksize: number;
    vsize: number;
}

export interface JiraCache {
    /**
     * Used to retrieve value for thing given key
     * @param {string | number} key
     * @returns {T | undefined}
     */
    get<T>(key: string | number): T | undefined;

    /**
     * Used to delete a key from the cache.
     *
     * @param {string | number} key
     * @returns {number} the number of values purged from the cache
     */
    del(key: string | number): number;

    /**
     * Used to set a new value.
     *
     * @param {string} key The name of the key to set
     * @param {T} value The data to populate
     * @param {number} ttl The number of seconds to keep this data before its purged
     */
    set<T>(
        key: string | number,
        value: T,
        ttl?: number,
    ): boolean;

    /**
     * Purge all cache entries
     */
    flushAll(): void;

    /**
     * Retrieve stats about cache usage
     *
     * @returns {JiraCacheStats}
     */
    getStats(): JiraCacheStats;
}
