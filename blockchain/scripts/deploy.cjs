
async function main() {
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    throw new Error(
      'No deployer wallet found. Check MONAD_PRIVATE_KEY in your local environment.'
    );
  }

  console.info('Deploying from:', await deployer.getAddress());

  const Registry = await ethers.getContractFactory(
    'CredChainRegistry',
    deployer
  );

  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  console.info(
    `CredChainRegistry deployed at ${await registry.getAddress()}`
  );
  console.info(`Deployer issuer: ${await registry.owner()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
