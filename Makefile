

start:
	export GOOGLE_APPLICATION_CREDENTIALS="$(PWD)/config.json" && firebase emulators:start --only functions;