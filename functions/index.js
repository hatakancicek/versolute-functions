const firebase = require("firebase-admin");
const functions = require("firebase-functions");

firebase.initializeApp();

const ERRORS = {
  MISSONG_PARAMS: "missing-params",
  UNKNOWN: "unknown"
};

const ACTIONS = {
  CREATE_USER: "create-user",
  CREATE_FIRM: "create-firm",
  UPDATE_FIRM: "update-firm",
  ADD_TO_FIRM: "add-to-firm",
  CREATE_WORKSPACE: "create-workspace",
  CREATE_PROJECT: "create-project",
  UPDATE_PROJECT: "update-project",
  UPDATE_WORKSPACE: "update-workspace",
  REMOVE_FROM_FIRM: "remove-from-firm",
  SEARCH_USER_BY_MAIL: "search-user-by-mail"
};

const ROLES = {
  ADMIN: "ADMIN"
};

exports.createUser = functions.https.onCall(async data => {
  const { email, password, displayName, photoURL } = data;

  if (!email || !password || !displayName || !photoURL)
    throw ERRORS.MISSONG_PARAMS;

  const now = Date.now();

  try {
    const user = await firebase.auth().createUser({
      email,
      password,
      displayName,
      photoURL
    });

    const userData = {
      createdAt: now,
      firmID: null,
      firmRole: null,
      email,
      displayName,
      photoURL
    };

    await firebase
      .firestore()
      .collection("users")
      .doc(user.uid)
      .set({
        createdAt: now,
        firmID: null,
        firmRole: null,
        email,
        displayName,
        photoURL
      });

    console.info({
      at: now,
      action: ACTIONS.CREATE_USER,
      email,
      displayName,
      photoURL
    });

    return userData;
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.updateUser = functions.https.onCall(async (data, context) => {
  const { auth } = context;

  const keys = {};
  ["email", "password", "displayName", "photoURL"].forEach(key => {
    if (data[key]) keys[key] = data[key];
  });

  if (!auth || !auth.uid || !Object.keys(keys).length)
    throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;

  const now = Date.now();

  console.log(keys);

  try {
    await firebase.auth().updateUser(uid, keys);

    delete keys.password;

    await firebase
      .firestore()
      .collection("users")
      .doc(uid)
      .update(keys);

    console.info({
      at: now,
      keys,
      action: ACTIONS.CREATE_USER
    });

    return;
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.searchUserByMail = functions.https.onCall(async (data, context) => {
  const { email } = data;
  const { auth } = context;

  if (!email || !auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  try {
    const userRecord = await firebase.auth().getUserByEmail(email);
    const user = userRecord.toJSON();

    console.info({
      email,
      user,
      by: auth.uid,
      at: Date.now(),
      action: ACTIONS.SEARCH_USER_BY_MAIL
    });

    return user;
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.createWorkspace = functions.https.onCall(async (data, context) => {
  const { id, name, description, photoURL } = data;

  if (!id || !name || !photoURL) throw ERRORS.MISSONG_PARAMS;

  const { auth } = context;
  if (!auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;
  const now = Date.now();

  try {
    const userRef = firebase
      .firestore()
      .collection("users")
      .doc(uid);
    const userDoc = await userRef.get();

    const { firmID } = userDoc.data();

    if (!firmID) throw ERRORS.MISSONG_PARAMS;

    const workspaceRef = firebase
      .firestore()
      .collection("workspaces")
      .doc(id);

    await workspaceRef.set({
      name,
      firmID,
      photoURL,
      description,
      createdBy: uid,
      createdAt: now
    });

    console.info({
      id,
      name,
      firmID,
      photoURL,
      description,
      by: uid,
      at: now,
      action: ACTIONS.CREATE_WORKSPACE
    });
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.updateWorkspaceInfo = functions.https.onCall(async (data, context) => {
  const { id, name, description, photoURL } = data;

  if (!id || !name || !photoURL) throw ERRORS.MISSONG_PARAMS;

  const { auth } = context;
  if (!auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;
  const now = Date.now();

  try {
    const workspaceRef = firebase
      .firestore()
      .collection("workspaces")
      .doc(id);
    const userRef = firebase
      .firestore()
      .collection("users")
      .doc(uid);

    const [workspaceDoc, userDoc] = await Promise.all([
      workspaceRef.get(),
      userRef.get()
    ]);

    if (!workspaceDoc.exists || !userDoc.exists) throw ERRORS.MISSONG_PARAMS;
    if (workspaceDoc.data().firmID !== userDoc.data().firmID)
      throw ERRORS.MISSONG_PARAMS;

    await workspaceRef.update({
      name,
      photoURL,
      description
    });

    console.info({
      id,
      name,
      photoURL,
      by: uid,
      at: now,
      description,
      action: ACTIONS.UPDATE_WORKSPACE
    });
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.createFirm = functions.https.onCall(async (data, context) => {
  const { id, name, crew, photoURL } = data;

  if (!id || !name || !crew || !crew.length || !photoURL)
    throw ERRORS.MISSONG_PARAMS;

  const { auth } = context;
  if (!auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;
  const now = Date.now();

  try {
    const firmRef = firebase
      .firestore()
      .collection("firms")
      .doc(id);

    const usersErrors = (
      await Promise.all(
        crew.map(el =>
          firebase
            .firestore()
            .collection("users")
            .doc(el)
            .get()
        )
      )
    )
      .map(el => !el.data())
      .filter(el => el);
    if (usersErrors.length) throw ERRORS.MISSONG_PARAMS;

    const batch = firebase.firestore().batch();

    batch.set(firmRef, {
      name,
      photoURL,
      createdBy: uid,
      createdAt: now
    });

    crew.forEach(el =>
      batch.update(
        firebase
          .firestore()
          .collection("users")
          .doc(el),
        {
          firmID: id,
          firmRole: ROLES.ADMIN
        }
      )
    );

    await batch.commit();

    console.info({
      id,
      name,
      crew,
      photoURL,
      by: uid,
      at: now,
      action: ACTIONS.CREATE_FIRM
    });
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.updateFirm = functions.https.onCall(async (data, context) => {
  const { id, name, photoURL } = data;

  if (!id || !name || !photoURL) throw ERRORS.MISSONG_PARAMS;

  const { auth } = context;
  if (!auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;
  const now = Date.now();

  try {
    const firmRef = firebase
      .firestore()
      .collection("firms")
      .doc(id);

    await firmRef.update({
      name,
      photoURL
    });

    console.info({
      id,
      name,
      photoURL,
      by: uid,
      at: now,
      action: ACTIONS.UPDATE_FIRM
    });
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.addToFirm = functions.https.onCall(async (data, context) => {
  const { userID, firmID } = data;

  if (!userID || !firmID) throw ERRORS.MISSONG_PARAMS;

  const { auth } = context;
  if (!auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;
  const now = Date.now();

  try {
    const userRef = firebase
      .firestore()
      .collection("users")
      .doc(userID);
    const firmRef = firebase
      .firestore()
      .collection("firms")
      .doc(firmID);
    const ownerRef = firebase
      .firestore()
      .collection("users")
      .doc(uid);

    const [user, firm, owner] = await Promise.all([
      userRef.get(),
      firmRef.get(),
      ownerRef.get()
    ]);

    if (!user.exists || !firm.exists || !owner.exists)
      throw ERRORS.MISSONG_PARAMS;

    const userData = user.data();
    const ownerData = owner.data();
    if (userData.firmID) throw ERRORS.MISSONG_PARAMS;
    if (ownerData.firmID !== firmID) throw ERRORS.MISSONG_PARAMS;

    await userRef.update({
      firmID,
      firmRole: ROLES.ADMIN
    });

    console.info({
      firmID,
      userID,
      by: uid,
      at: now,
      action: ACTIONS.ADD_TO_FIRM
    });
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.removeFromFirm = functions.https.onCall(async (data, context) => {
  const { userID, firmID } = data;

  if (!userID || !firmID) throw ERRORS.MISSONG_PARAMS;

  const { auth } = context;
  if (!auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;
  const now = Date.now();

  try {
    const userRef = firebase
      .firestore()
      .collection("users")
      .doc(userID);
    const firmRef = firebase
      .firestore()
      .collection("firms")
      .doc(firmID);
    const ownerRef = firebase
      .firestore()
      .collection("users")
      .doc(uid);

    const [user, firm, owner] = await Promise.all([
      userRef.get(),
      firmRef.get(),
      ownerRef.get()
    ]);

    if (!user.exists || !firm.exists || !owner.exists)
      throw ERRORS.MISSONG_PARAMS;

    const userData = user.data();
    const ownerData = owner.data();
    if (userData.firmID !== firmID) throw ERRORS.MISSONG_PARAMS;
    if (ownerData.firmID !== firmID) throw ERRORS.MISSONG_PARAMS;

    await userRef.update({
      firmID: null,
      firmRole: null
    });

    console.info({
      firmID,
      userID,
      by: uid,
      at: now,
      action: ACTIONS.REMOVE_FROM_FIRM
    });
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.createProject = functions.https.onCall(async (data, context) => {
  const { workspaceID, name, description, manager, startDate } = data;

  if (!workspaceID || !name || !manager || !startDate)
    throw ERRORS.MISSONG_PARAMS;

  const { auth } = context;
  if (!auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;
  const now = Date.now();

  try {
    const workspaceRef = firebase
      .firestore()
      .collection("workspaces")
      .doc(workspaceID);
    const userRef = firebase
      .firestore()
      .collection("users")
      .doc(uid);
    const [userDoc, workspaceDoc] = await Promise.all([
      userRef.get(),
      workspaceRef.get()
    ]);

    const { firmID } = userDoc.data();

    if (!firmID || firmID !== workspaceDoc.data().firmID)
      throw ERRORS.MISSONG_PARAMS;

    const projectRef = firebase
      .firestore()
      .collection("projects")
      .doc();

    await projectRef.set({
      createdAt: now,
      createdBy: uid,
      firmID,
      workspaceID,
      manager,
      description: description || "",
      startDate,
      name
    });

    console.info({
      at: now,
      by: uid,
      firmID,
      workspaceID,
      manager,
      description: description || "",
      startDate,
      name,
      action: ACTIONS.CREATE_PROJECT,
      id: projectRef.id
    });

    return {
      id: projectRef.id
    };
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});

exports.updateProject = functions.https.onCall(async (data, context) => {
  const { id, name, description, manager, startDate } = data;

  if (!id || !name || !manager || !startDate) throw ERRORS.MISSONG_PARAMS;

  const { auth } = context;
  if (!auth || !auth.uid) throw ERRORS.MISSONG_PARAMS;

  const { uid } = auth;
  const now = Date.now();

  try {
    const projectRef = firebase
      .firestore()
      .collection("projects")
      .doc(id);
    const userRef = firebase
      .firestore()
      .collection("users")
      .doc(uid);
    const [userDoc, projectDoc] = await Promise.all([
      userRef.get(),
      projectRef.get()
    ]);

    const { firmID } = userDoc.data();

    if (!firmID || firmID !== projectDoc.data().firmID)
      throw ERRORS.MISSONG_PARAMS;

    await projectRef.update({
      manager,
      description: description || "",
      startDate,
      name
    });

    console.info({
      at: now,
      by: uid,
      manager,
      description: description || "",
      startDate,
      name,
      action: ACTIONS.CREATE_PROJECT,
      id: projectRef.id
    });
  } catch (error) {
    console.error(error);

    throw new functions.https.HttpsError("unknown", error.code);
  }
});
