// yarn add @octokit/core @octokit/plugin-rest-endpoint-methods

import { Octokit } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";

const MyOctokit = Octokit.plugin(restEndpointMethods);
const octokit = new MyOctokit({ auth: process.env.GITHUB_TOKEN });

let orgRepo = process.env.GITHUB_REPOSITORY.split("/")
let owner = orgRepo[0]
let repo = orgRepo[1]
octokit.rest.actions.listArtifactsForRepo({
    owner: owner,
    repo: repo
})
    .then((res) => {
        let regex = new RegExp(`-PR-${process.env.GITHUB_PR_NUM}-`, "gm")
        let artifacts = res.data.artifacts.filter(d => !d.expired)

        let currentPRArtifacts = []
        let candidates = []

        for (let artifact of artifacts) {
            if (artifact.name.match(regex)) {
                currentPRArtifacts.push(artifact)
            } else {
                candidates.push(artifact)
            }
        }

        console.log("delete current PR artifacts")
        currentPRArtifacts.forEach(artifact => {
            console.log(`deleting ${artifact.name}`)
            octokit.rest.actions.deleteArtifact({
                owner: owner,
                repo: repo,
                artifact_id: artifact.id
            })
        })

        console.log("delete old artifacts")
        candidates.sort((a, b) => new Date(b.created_at) - new Date(b.created_at)).slice(3)
            .forEach(artifact => {
                console.log(`deleting ${artifact.name}`)
                octokit.rest.actions.deleteArtifact({
                    owner: owner,
                    repo: repo,
                    artifact_id: artifact.id
                })
            })
    })
