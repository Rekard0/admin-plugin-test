import {ProxyCreatedEvent} from '../../../typechain/ProxyFactory';
import {HardhatClass} from './hardhat';
import {ZkSync} from './zksync';
import {findEvent} from '@aragon/osx-commons-sdk';
import {BigNumberish, Contract, Wallet} from 'ethers';
import {providers} from 'ethers';
import hre, {ethers} from 'hardhat';

// TODO: generate paths programatically.
export const ARTIFACT_SOURCES = {
  DAO: '@aragon/osx/core/dao/DAO.sol:DAO',
  DAO_V1_0_0: '@aragon/osx-v1.0.1/core/dao/DAO.sol:DAO',
  DAO_V1_3_0: '@aragon/osx-v1.3.0/core/dao/DAO.sol:DAO',
  MajorityVotingMock: 'src/mocks/MajorityVotingMock.sol:MajorityVotingMock',
  VotingPowerCondition: 'src/VotingPowerCondition.sol:VotingPowerCondition',
  TokenVoting: 'src/TokenVoting.sol:TokenVoting',
  TestGovernanceERC20: 'src/mocks/TestGovernanceERC20.sol:TestGovernanceERC20',
  GovernanceERC20: 'src/ERC20/governance/GovernanceERC20.sol:GovernanceERC20',
  ERC20Mock: 'src/mocks/ERC20Mock.sol:ERC20Mock',
  GovernanceWrappedERC20:
    'src/ERC20/governance/GovernanceWrappedERC20.sol:GovernanceWrappedERC20',
  CustomExecutorMock: 'src/mocks/CustomExecutorMock.sol:CustomExecutorMock',
  ERC20: '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
  TokenVotingSetup: 'src/TokenVotingSetup.sol:TokenVotingSetup',
  TokenVotingSetupZkSync:
    'src/zksync/TokenVotingSetupZkSync.sol:TokenVotingSetupZkSync',
};

export type DeployOptions = {
  initArgs?: any[]; // initialize function arguments in case `withProxy` is set to true.
  args?: any[]; // constructor arguments
  withProxy?: boolean;
  proxySettings?: {
    type?: 'uups' | 'transparent' | 'beacon' | undefined;
    initializer?: string;
  };
};

export interface NetworkDeployment {
  deploy(artifactName: string, args: any[]): any;
  getCreateAddress(sender: string, nonce: BigNumberish): string;
  getNonce(
    sender: string,
    type?: 'Deployment' | 'Transaction'
  ): Promise<number>;
  encodeFunctionData(
    artifactName: string,
    functionName: string,
    args: any[]
  ): Promise<string>;
  deployProxy(
    deployer: number,
    artifactName: string,
    options: DeployOptions
  ): Promise<Contract>;
  upgradeProxy(
    upgrader: number,
    proxyAddress: string,
    newArtifactName: string,
    options: DeployOptions
  ): Promise<Contract>;
}

export class Wrapper {
  network: NetworkDeployment;

  constructor(_network: NetworkDeployment) {
    this.network = _network;
  }

  // Creates an according wrapper class depending on the network.
  // Note that on zksync network, node only has 10 rich addresses whereas
  // on hardhat, it's 20. Tests are heavily using the numbers in the Signers
  // object from 10 to 20. So We make 10 custom addresses rich-funded to
  // allow tests use the same approach on zksync as on hardhat.
  static async create(networkName: string, provider: providers.BaseProvider) {
    if (networkName == 'zkLocalTestnet' || networkName == 'zkSyncLocal') {
      const signers = await ethers.getSigners();
      const allSigners = signers.map(signer => signer.address);

      for (let i = 10; i < 20; i++) {
        await signers[0].sendTransaction({
          to: allSigners[i],
          value: ethers.utils.parseEther('0.5'),
        });
      }

      // @ts-ignore TODO:GIORGI
      return new Wrapper(new ZkSync(provider));
    }

    return new Wrapper(new HardhatClass(provider));
  }

  async deploy(artifactName: string, options?: DeployOptions) {
    const constructorArgs = options?.args ?? [];
    const isProxy = options?.withProxy ?? false;
    const initializer = options?.proxySettings?.initializer ?? undefined;

    let {artifact, contract} = await this.network.deploy(
      artifactName,
      constructorArgs
    );
    if (isProxy) {
      const {contract: proxyFactoryContract} = await this.network.deploy(
        'ProxyFactory',
        [contract.address]
      );

      // Currently, always deploys with UUPS
      let data = '0x';
      if (initializer) {
        data = await this.network.encodeFunctionData(
          artifactName,
          initializer,
          options?.initArgs ?? []
        );
      }

      const tx = await proxyFactoryContract.deployUUPSProxy(data);

      const event = findEvent<ProxyCreatedEvent>(
        await tx.wait(),
        'ProxyCreated'
      );

      contract = new hre.ethers.Contract(
        event.args.proxy,
        artifact.abi,
        (await hre.ethers.getSigners())[0]
      );
    }

    return contract;
  }

  getCreateAddress(sender: string, nonce: BigNumberish): string {
    return this.network.getCreateAddress(sender, nonce);
  }

  async getNonce(
    sender: string,
    type?: 'Deployment' | 'Transaction'
  ): Promise<number> {
    return this.network.getNonce(sender, type ?? 'Deployment');
  }

  async deployProxy(
    deployer: number,
    artifactName: string,
    options?: DeployOptions
  ) {
    const _options: DeployOptions = {
      args: options?.args ?? [],
      initArgs: options?.initArgs ?? [],
      proxySettings: {
        type: options?.proxySettings?.type ?? 'uups',
        initializer: options?.proxySettings?.initializer ?? undefined,
      },
    };

    return this.network.deployProxy(deployer, artifactName, _options);
  }

  async upgradeProxy(
    upgrader: number,
    proxyAddress: string,
    newArtifactName: string,
    options?: DeployOptions
  ) {
    const _options: DeployOptions = {
      args: options?.args ?? [],
      initArgs: options?.initArgs ?? [],
      proxySettings: {
        initializer: options?.proxySettings?.initializer ?? undefined,
      },
    };
    return this.network.upgradeProxy(
      upgrader,
      proxyAddress,
      newArtifactName,
      _options
    );
  }
}
