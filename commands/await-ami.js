const { MarketplaceCatalogClient, DescribeEntityCommand } = require("@aws-sdk/client-marketplace-catalog");
const Params = require('./helpers/params');

exports.main = async function(args){
    // Get app and product ID
    const app = await Params.getApp(args.app);
    const productId = app.pid;
    const version = args.v;

    if (!productId) {
        console.log('ERR: No marketplace listing found for app:', args.app);
        throw new Error('No marketplace listing found. Use new-listing first.');
    }

    console.log('Waiting for AMI version to become available:');
    console.log('\tProduct ID:', productId);
    console.log('\tVersion:', version);
    console.log('----------');

    // Create AWS client
    const client = new MarketplaceCatalogClient({ region: process.env.orgRegion });

    // Wait for version availability
    await waitForVersionAvailability(client, productId, version);

    return true;
}

// Wait for Version Availability Function
const waitForVersionAvailability = async (client, productId, version) => {
    const maxAttempts = 1080; // 90 minutes with 5-second intervals (90 * 60 / 5 = 1080)
    let attempts = 0;

    console.log(`Polling entity for version ${version} availability...`);
    console.log(`Timeout: 90 minutes (will check every 5 seconds)`);

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

        try {
            const describeEntityCommand = new DescribeEntityCommand({
                Catalog: "AWSMarketplace",
                EntityId: productId,
            });

            const entityResponse = await client.send(describeEntityCommand);

            // Parse the Details field which contains version information
            let details;
            if (typeof entityResponse.Details === 'string') {
                details = JSON.parse(entityResponse.Details);
            } else {
                details = entityResponse.Details;
            }

            // Check if version exists in Versions array
            const versionInfo = details.Versions?.find(v => v.VersionTitle === version);

            if (versionInfo) {
                // Check if version has delivery options (indicates it's available)
                const hasDeliveryOptions = versionInfo.DeliveryOptions &&
                                          versionInfo.DeliveryOptions.length > 0;

                if (hasDeliveryOptions) {
                    // Check if any delivery option has Sources (indicates AMI is accessible)
                    const hasActiveSources = versionInfo.DeliveryOptions.some(
                        option => option.Details?.AmiDeliveryOptionDetails?.AmiSource ||
                                 option.Details?.AmiSource
                    );

                    if (hasActiveSources) {
                        console.log(`✓ Version ${version} is now available to consumers`);
                        console.log("Version details:", JSON.stringify(versionInfo, null, 2));
                        return true;
                    }
                }

                const elapsedMinutes = Math.floor((attempts * 5) / 60);
                console.log(`Version ${version} found but not yet fully available (${elapsedMinutes}m ${(attempts * 5) % 60}s elapsed, attempt ${attempts + 1}/${maxAttempts})`);
            } else {
                const elapsedMinutes = Math.floor((attempts * 5) / 60);
                console.log(`Version ${version} not yet visible in entity (${elapsedMinutes}m ${(attempts * 5) % 60}s elapsed, attempt ${attempts + 1}/${maxAttempts})`);
            }

        } catch (error) {
            console.error("Error checking entity status:", error.message);
        }

        attempts++;
    }

    console.warn(`⚠ Warning: Version availability check timed out after 90 minutes`);
    console.warn("Version may still be under AWS Marketplace review");
    console.warn("The changeset succeeded, but the version is not yet publicly available to consumers");
    return false;
};
