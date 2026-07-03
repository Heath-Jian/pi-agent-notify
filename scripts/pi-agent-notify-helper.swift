import Cocoa

let args = CommandLine.arguments

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

if args.contains("--clear") {
    NSUserNotificationCenter.default.removeAllDeliveredNotifications()
    exit(0)
}

if args.count < 3 {
    exit(0)
}

let notificationTitle = args[1]
let notificationBody = args[2]
let notificationSound = args.count > 3 ? args[3] : ""

let notification = NSUserNotification()
notification.title = notificationTitle
notification.informativeText = notificationBody
notification.hasActionButton = false
if !notificationSound.isEmpty {
    notification.soundName = notificationSound
}

NSUserNotificationCenter.default.deliver(notification)
RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.35))
