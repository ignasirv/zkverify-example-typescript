import { initializeApi, submitProof, validateEnvVariables } from '../utils/helpers';
import { generateAndNativelyVerifyProof } from '../common/generate-proof';
import { handleTransaction } from '../utils/transactions';
import ultraPlonkProof from './proof';
import fs from 'fs';
import path from 'path';

const proofTypeToPallet: Record<string, string> = {
    groth16: "settlementGroth16Pallet",
    fflonk: "settlementFFlonkPallet",
    zksync: "settlementZksyncPallet",
    risc0: "settlementRisc0Pallet",
};

const main = async (): Promise<void> => {
    const proofType = process.argv[2];
    const skipAttestationArg = process.argv[3];
    const skipAttestation = skipAttestationArg === 'true';

    if (!proofType) {
        throw new Error('Proof type argument is required. Usage: npm run generate:single:proof <proof-type> <skipAttestation>');
    }

    validateEnvVariables(['WEBSOCKET', 'SEED_PHRASE']);

    const { api, provider, account } = await initializeApi();

    try {
        console.log(`Generating the proof for ${proofType}`);
        let proofParams;
        let pallet;
        if (proofType === 'ultraPlonk') {
            const vk = fs.readFileSync(path.join(__dirname, './vk.bin')).toString('hex');
            const hashVk = Uint8Array.from(Buffer.from(vk, 'hex'));;
            proofParams = [
                { 'Vk': hashVk },
                ultraPlonkProof.proof,
                ultraPlonkProof.verifyInputs,
            ];
            pallet = "settlementUltraplonkPallet";
        } else {
            let { proof, publicSignals, vk } = await generateAndNativelyVerifyProof(proofType);
            console.log(`${proofType} Proof generated and natively verified.`);
            vk = fs.readFileSync(path.join(__dirname, './vk.bin')).toString('hex');
            const hashVk = Uint8Array.from(Buffer.from(vk, 'hex'));;
            proofParams = [
                { 'Vk': hashVk },
                proof.proof,
                proof.verifyInputs,
            ];
            pallet = proofTypeToPallet[proofType.trim()];
        }


        const transaction = submitProof(api, pallet, proofParams);

        const startTime = Date.now();
        const timerRefs = { interval: null as NodeJS.Timeout | null, timeout: null as NodeJS.Timeout | null };

        console.log(`Sending ${proofType} proof to zkVerify for verification...`)
        const result = await handleTransaction(api, transaction, account, proofType, startTime, false, timerRefs, undefined, skipAttestation);

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Sent 1 proof, elapsed time: ${elapsedTime}s, result: ${result.result}, attestationId: ${result.attestationId}`);
    } catch (error) {
        console.error(`Failed to send proof: ${error}`);
    } finally {
        if (api) await api.disconnect();
        if (provider) await provider.disconnect();
        process.exit(0);
    }
};

main().catch(console.error);
