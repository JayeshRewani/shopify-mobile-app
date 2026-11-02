import { buildFcmMessage, classifyFcmResponse } from "./fcm-result.js";
import { TransientError } from "./message.js";

const apps = new Map();

export function createFirebaseSender(admin = null) {
  return {
    async sendEach({ serviceAccount, campaign, devices }) {
      const firebase = admin ?? (await import("firebase-admin")).default;
      const app = appFor(firebase, serviceAccount);
      let response;
      try {
        response = await firebase.messaging(app).sendEach(
          devices.map((device) => buildFcmMessage(campaign, device)),
        );
      } catch (error) {
        throw new TransientError(error?.code || error?.message || "fcm_send_failed");
      }
      return response.responses.map((item, index) => classifyFcmResponse(item, devices[index]));
    },
  };
}

function appFor(firebase, serviceAccount) {
  const name = serviceAccount.project_id;
  if (!apps.has(name)) {
    apps.set(
      name,
      firebase.initializeApp(
        { credential: firebase.credential.cert(serviceAccount) },
        name,
      ),
    );
  }
  return apps.get(name);
}
