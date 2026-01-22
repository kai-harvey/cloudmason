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
            console.log('Version details:', versionInfo);

            if (versionInfo) {
                // Check 1: Version must have Sources array with AMI
                const hasSources = Array.isArray(versionInfo.Sources) &&
                                  versionInfo.Sources.length > 0 &&
                                  versionInfo.Sources.some(source => source.Image && source.Image.startsWith('ami-'));

                // Check 2: Version must have DeliveryOptions array
                const hasDeliveryOptions = Array.isArray(versionInfo.DeliveryOptions) &&
                                          versionInfo.DeliveryOptions.length > 0;

                // Check 3: At least one DeliveryOption must have Visibility set to 'Public'
                const isPubliclyVisible = hasDeliveryOptions &&
                                         versionInfo.DeliveryOptions.some(option => option.Visibility === 'Public');

                if (hasSources && hasDeliveryOptions && isPubliclyVisible) {
                    console.log(`✓ Version ${version} is now available to consumers`);

                    // Extract and display AMI details
                    const amiSources = versionInfo.Sources.filter(s => s.Image);
                    amiSources.forEach(source => {
                        console.log(`  AMI ID: ${source.Image}`);
                        console.log(`  Architecture: ${source.Architecture}`);
                        console.log(`  Type: ${source.VirtualizationType}`);
                    });

                    // Display public delivery options
                    const publicOptions = versionInfo.DeliveryOptions.filter(opt => opt.Visibility === 'Public');
                    console.log(`  Public Delivery Options: ${publicOptions.length}`);
                    publicOptions.forEach(opt => {
                        console.log(`    - ${opt.Title || opt.Type}`);
                        if (opt.AmiAlias) console.log(`      SSM Alias: ${opt.AmiAlias}`);
                    });

                    return true;
                }

                // Provide detailed feedback on what's missing
                const elapsedMinutes = Math.floor((attempts * 5) / 60);
                const reasons = [];
                if (!hasSources) reasons.push('no AMI sources');
                if (!hasDeliveryOptions) reasons.push('no delivery options');
                if (hasDeliveryOptions && !isPubliclyVisible) reasons.push('not publicly visible yet');

                console.log(`Version ${version} found but not yet fully available: ${reasons.join(', ')} (${elapsedMinutes}m ${(attempts * 5) % 60}s elapsed, attempt ${attempts + 1}/${maxAttempts})`);
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
