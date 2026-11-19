export {
  parseSemver,
  compareSemver,
  isVersionSatisfied,
  normalizeScopePrefix,
  resolveCiRegistryContext,
  isPrivateRegistryUrl,
  extractScopedDependencies,
  checkPackageAvailability,
  waitForAllDependencies,
  patchDockerfileVendorTarballs,
  patchDockerComposeBuildNetwork
} from './waitForDeps.mjs'

export { scanRepositoryForLeaks } from './sanitizeRepo.mjs'
