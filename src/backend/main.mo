actor {
  var highScore = 0;

  public shared ({ caller }) func submitScore(score : Nat) : async Nat {
    if (score > highScore) {
      highScore := score;
    };
    highScore;
  };

  public query ({ caller }) func getHighScore() : async Nat {
    highScore;
  };
};
