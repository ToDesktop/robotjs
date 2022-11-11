const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

module.exports = async (props) => {
  const { tag, manifest } = await parseManifest();
  console.log("✅ parsed manifest", tag);

  const prebuildsDir = path.join(__dirname, "../", "prebuilds");
  console.log(`ℹ️ accessing artifacts in "${prebuildsDir}" ...`);

  const artifactsZip = await prepareArtifacts({ prebuildsDir, tag, ...props });
  console.log("✅ artifacts zip", artifactsZip);

  let release = await getRelease({ tag, ...props });

  if (release) {
    release = await updateRelease({
      ...props,
      manifest,
      release,
      tag,
    });
    console.log("✅ updated release", release.data.name);
  } else {
    release = await createRelease({ ...props, manifest, tag });
    console.log("✅ created release", release.data.name);
  }

  await uploadReleaseArtifacts({
    ...props,
    tag,
    release,
    artifactsZip,
  });

  console.log("✅ finished releasing artifacts");
};

async function parseManifest() {
  const rootDir = path.join(__dirname, "../", "package.json");
  const packageJson = fs.readFileSync(rootDir);

  const manifest = JSON.parse(packageJson);
  const tag = `${process.platform}-${manifest.version}`;
  return { manifest, tag };
}

async function prepareArtifacts({ prebuildsDir, tag, zip }) {
  const artifactsZip = `${tag}.zip`;
  const zipDir = path.join(prebuildsDir, "../", artifactsZip);

  if (process.platform === "win32") {
    await execScript(`mkdir ${zipDir}`);
  }

  zip.zipSync(prebuildsDir, zipDir);
  return zipDir;
}

async function execScript(script) {
  return new Promise((resolve, reject) => {
    return exec(script, (err, stdout, stderr) => {
      if (err || stderr) return reject(err || new Error(`❌ ${stderr}`));
      console.log(stdout);
      resolve(stdout);
    });
  });
}

async function getRelease({ github, context, tag }) {
  try {
    return await github.rest.repos.getReleaseByTag({
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag,
    });
  } catch {
    return null;
  }
}

async function createRelease({ github, context, manifest, tag }) {
  return await github.rest.repos.createRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    tag_name: tag,
    name: tag,
    body: manifest.name,
  });
}

async function updateRelease({ github, context, manifest, release, tag }) {
  return await github.rest.repos.updateRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    release_id: release.data.id,
    name: tag,
    body: manifest.name,
  });
}

async function uploadReleaseArtifacts({
  github,
  context,
  tag,
  release,
  artifactsZip,
}) {
  const data = fs.readFileSync(artifactsZip);

  try {
    return await github.rest.repos.uploadReleaseAsset({
      owner: context.repo.owner,
      repo: context.repo.repo,
      release_id: release.data.id,
      name: `${tag}.zip`,
      data,
      headers: {
        accept: "application/zip",
      },
    });
  } catch (err) {
    console.log(err.status);
    if (err.status !== 422) {
      console.log(err);
      throw err;
    }
    console.log(`ℹ️ upload already exists `);
  }
}
