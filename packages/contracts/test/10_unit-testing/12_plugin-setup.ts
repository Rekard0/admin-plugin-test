import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {PLUGIN_SETUP_CONTRACT_NAME} from '../../plugin-settings';
import buildMetadata from '../../src/build-metadata.json';
import {AdminSetup, Admin__factory, AdminSetup__factory} from '../../typechain';
import {isZkSync} from '../../utils/zkSync';
import {
  ADMIN_INTERFACE,
  EXECUTE_PROPOSAL_PERMISSION_ID,
  SET_TARGET_CONFIG_PERMISSION_ID,
  TargetConfig,
} from '../admin-constants';
import {Operation as Op} from '../admin-constants';
import {loadFixtureCustom} from '../test-utils/fixture';
import {skipTestIfNetworkIsZkSync} from '../test-utils/skip-functions';
import {ARTIFACT_SOURCES} from '../test-utils/wrapper';
import {
  Operation,
  DAO_PERMISSIONS,
  getInterfaceId,
  getNamedTypesFromMetadata,
} from '@aragon/osx-commons-sdk';
import {DAO} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import hre, {ethers} from 'hardhat';

type FixtureResult = {
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  pluginSetup: AdminSetup;
  prepareInstallationInputs: string;
  prepareUninstallationInputs: string;
  dao: DAO;
  targetConfig: TargetConfig;
};

async function fixture(): Promise<FixtureResult> {
  const [deployer, alice, bob] = await ethers.getSigners();
  const dummyMetadata = '0x12345678';
  const dao = await createDaoProxy(deployer, dummyMetadata);

  const artifactSource = isZkSync(hre.network.name)
    ? ARTIFACT_SOURCES.AdminSetupZkSync
    : ARTIFACT_SOURCES.AdminSetup;

  const pluginSetup = await hre.wrapper.deploy(artifactSource);

  const targetConfig: TargetConfig = {
    operation: Op.call,
    target: dao.address,
  };

  const prepareInstallationInputs = ethers.utils.defaultAbiCoder.encode(
    getNamedTypesFromMetadata(
      buildMetadata.pluginSetup.prepareInstallation.inputs
    ),
    [alice.address, targetConfig]
  );
  const prepareUninstallationInputs = ethers.utils.defaultAbiCoder.encode(
    getNamedTypesFromMetadata(
      buildMetadata.pluginSetup.prepareUninstallation.inputs
    ),
    []
  );

  return {
    deployer,
    alice,
    bob,
    pluginSetup,
    prepareInstallationInputs,
    prepareUninstallationInputs,
    dao,
    targetConfig,
  };
}

describe(PLUGIN_SETUP_CONTRACT_NAME, function () {
  it('does not support the empty interface', async () => {
    const {pluginSetup} = await loadFixtureCustom(fixture);
    expect(await pluginSetup.supportsInterface('0xffffffff')).to.be.false;
  });

  skipTestIfNetworkIsZkSync(
    'zkSync plugin setup use address 0 as implementation',
    () => {
      it('has an admin plugin implementation base with the correct interface', async () => {
        const {deployer, pluginSetup} = await loadFixtureCustom(fixture);

        const admin = Admin__factory.connect(
          await pluginSetup.implementation(),
          deployer
        );
        expect(
          await admin.supportsInterface(getInterfaceId(ADMIN_INTERFACE))
        ).to.be.eq(true);
      });
    }
  );

  describe('prepareInstallation', async () => {
    it('fails if data is empty, or not of minimum length', async () => {
      const {pluginSetup, prepareInstallationInputs, dao} =
        await loadFixtureCustom(fixture);

      await expect(pluginSetup.prepareInstallation(dao.address, [])).to.be
        .reverted;

      const trimmedData = prepareInstallationInputs.substring(
        0,
        prepareInstallationInputs.length - 2
      );
      await expect(pluginSetup.prepareInstallation(dao.address, trimmedData)).to
        .be.reverted;

      await expect(
        pluginSetup.prepareInstallation(dao.address, prepareInstallationInputs)
      ).not.to.be.reverted;
    });

    it('reverts if encoded address in `_data` is zero', async () => {
      const {pluginSetup, dao, targetConfig} = await loadFixtureCustom(fixture);

      const dataWithAddressZero = ethers.utils.defaultAbiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs
        ),
        [ethers.constants.AddressZero, targetConfig]
      );

      await expect(
        pluginSetup.prepareInstallation(dao.address, dataWithAddressZero)
      )
        .to.be.revertedWithCustomError(pluginSetup, 'AdminAddressInvalid')
        .withArgs(ethers.constants.AddressZero);
    });

    it('returns the plugin, helpers and permissions', async () => {
      const {alice, pluginSetup, prepareInstallationInputs, dao} =
        await loadFixtureCustom(fixture);

      const nonce = await hre.wrapper.getNonce(pluginSetup.address);
      const anticipatedPluginAddress = hre.wrapper.getCreateAddress(
        pluginSetup.address,
        nonce
      );

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareInstallation(
        dao.address,
        prepareInstallationInputs
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(0);
      expect(permissions.length).to.be.equal(3);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          alice.address,
          ethers.constants.AddressZero,
          EXECUTE_PROPOSAL_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          ethers.constants.AddressZero,
          SET_TARGET_CONFIG_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          dao.address,
          plugin,
          ethers.constants.AddressZero,
          DAO_PERMISSIONS.EXECUTE_PERMISSION_ID,
        ],
      ]);
    });

    it('sets the dao for prepared plugins', async () => {
      const {deployer, pluginSetup, prepareInstallationInputs, dao} =
        await loadFixtureCustom(fixture);

      // Check the nonce of the setup contract to obtain the address of the next deployed contract, which will be the plugin clone
      const nonce = await hre.wrapper.getNonce(pluginSetup.address);
      const anticipatedPluginAddress = hre.wrapper.getCreateAddress(
        pluginSetup.address,
        nonce
      );

      await pluginSetup.prepareInstallation(
        dao.address,
        prepareInstallationInputs
      );

      const adminAddressContract = Admin__factory.connect(
        anticipatedPluginAddress,
        deployer
      );

      expect(await adminAddressContract.dao()).to.be.equal(dao.address);
    });
  });

  describe('prepareUninstallation', async () => {
    it('returns the permissions', async () => {
      const {pluginSetup, prepareUninstallationInputs, dao} =
        await loadFixtureCustom(fixture);

      const plugin = ethers.Wallet.createRandom().address;

      const permissions = await pluginSetup.callStatic.prepareUninstallation(
        dao.address,
        {
          plugin,
          currentHelpers: [],
          data: prepareUninstallationInputs,
        }
      );

      expect(permissions.length).to.be.equal(2);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dao.address,
          plugin,
          ethers.constants.AddressZero,
          DAO_PERMISSIONS.EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin,
          dao.address,
          ethers.constants.AddressZero,
          SET_TARGET_CONFIG_PERMISSION_ID,
        ],
      ]);
    });
  });
});
