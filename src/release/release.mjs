import { Octokit } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import * as fs from "node:fs";
import { fileURLToPath } from 'url';
import * as path from "node:path";
import * as dotenv from "dotenv";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (fs.existsSync(path.join(__dirname, '../../.env'))) {
    console.log("local debug mode")
    dotenv.config(); // Load environment variables from .env file

}

const MyOctokit = Octokit.plugin(restEndpointMethods);
const octokit = new MyOctokit({ auth: process.env.GITHUB_TOKEN });


let orgRepo = process.env.GITHUB_REPOSITORY.split("/")
let owner = orgRepo[0]
let repo = orgRepo[1]
let prNum = process.env.GITHUB_PR_NUM
let headBranch = process.env.HEAD_BRANCH
let headSha = process.env.HEAD_SHA

const regex = /.+-PR-\d+-(\d+\.\d+\.\d+).+/gm;

async function getWorkflowRun(name) {
   let res = await octokit.rest.actions.listWorkflowRuns({
       owner: owner,
       repo: repo,
       workflow_id: name,
       conclusion: "success"
   })

   return res.data.workflow_runs
}

async function getArtifact(run_id) {
   let res = await octokit.rest.actions.listWorkflowRunArtifacts({
            owner: owner,
            repo: repo,
            run_id
        })

   return res.data.artifacts
}


export async function main() {
    console.log(`get pr info: ${owner}/${repo} #${prNum}`)
    const { data: pr } = await octokit.rest.pulls.get({
        owner: owner,
        repo: repo,
        pull_number: prNum
    })
    console.log(`pr body: ${pr.body}`)

    console.log(`get workflow info: ${process.env.WORKFLOW_ID}`)
    let workflowRuns = await getWorkflowRun(process.env.WORKFLOW_ID)
    let run = workflowRuns.find(run => run.head_sha == headSha && run.head_branch == headBranch && run.event == "pull_request")
    if (run.conclusion != "success") {
        console.log(run)
        throw new Error("the last run failed")
    }
    console.log(`get artifact info: ${run.id}`)
    let artifacts = await getArtifact(run.id)
    if (artifacts.length === 0) {
        throw new Error("no artifact found")
    }
    let artifact = artifacts.find(artifact => artifact.name.indexOf( `-PR-${prNum}-`) > 0)
    if (!artifact) {
        throw new Error("no artifact found")
    }
    console.log(`artifact name: ${artifact.name}`)
    let m = regex.exec(artifact.name)
    if (!m) {
        throw new Error("invalid artifact name: " + artifact.name)
    }
    let version = m[1]
    console.log(version)

    console.log(`download artifact: ${artifact.name}`)
    const { data: downloadData } = await octokit.rest.actions.downloadArtifact({
        owner: owner,
        repo: repo,
        artifact_id: artifact.id,
        archive_format: "zip",
    })

    console.log(`create release: ${version}`)
    let { data: release } = await octokit.rest.repos.createRelease({
        owner: owner,
        repo: repo,
        tag_name: `v${version}`,
        name: `v${version}`,
        body: pr.body || `release ${version}`,
    })
    console.log(`upload asset: ${artifact.name}`)
    await octokit.rest.repos.uploadReleaseAsset({
        owner: owner,
        repo: repo,
        release_id: release.id,
        data: downloadData,
        name: artifact.name,
        headers: {
            "Content-Type": "application/zip",
            "Content-Length": downloadData.byteLength
        }
    })
}

await main()