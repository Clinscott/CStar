public enum State: Equatable {
    case constructed
    case submitted
    case observed
    case disposed
}

public enum Event {
    case construct
    case submit
    case observe
    case dispose
}

public enum Result: Equatable {
    case accepted(State)
    case rejectedInvalidTransition
}

public func reduce(state: State?, event: Event) -> Result {
    switch (state, event) {
    case (nil, .construct):
        return .accepted(.constructed)
    case (.some(.constructed), .submit):
        return .accepted(.submitted)
    case (.some(.submitted), .observe):
        return .accepted(.observed)
    case (.some(.observed), .dispose),
         (.some(.constructed), .dispose):
        return .accepted(.disposed)
    default:
        return .rejectedInvalidTransition
    }
}
