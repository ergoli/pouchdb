"use strict";

var adapters = ['local-1', 'http-1'];

function makeDocs(start, end, templateDoc) {
  var templateDocSrc = templateDoc ? JSON.stringify(templateDoc) : "{}";
  if (end === undefined) {
    end = start;
    start = 0;
  }
  var docs = [];
  for (var i = start; i < end; i++) {
    /*jshint evil:true */
    var newDoc = eval("(" + templateDocSrc + ")");
    newDoc._id = (i).toString();
    newDoc.integer = i;
    newDoc.string = (i).toString();
    docs.push(newDoc);
  }
  return docs;
}
describe('bulk_docs', function () {
  adapters.map(function(adapter) {

    describe(adapter, function () {
      beforeEach(function () {
        this.name = testUtils.generateAdapterUrl(adapter);
        PouchDB.enableAllDbs = true;
      });
      afterEach(testUtils.cleanupTestDatabases);


      var authors = [
        {name: 'Dale Harvey', commits: 253},
        {name: 'Mikeal Rogers', commits: 42},
        {name: 'Johannes J. Schmidt', commits: 13},
        {name: 'Randall Leeds', commits: 9}
      ];

      it('Testing bulk docs', function(done) {
        testUtils.initTestDB(this.name, function(err, db) {
          var docs = makeDocs(5);
          db.bulkDocs({docs: docs}, function(err, results) {
            results.should.have.length(5, 'results length matches');
            for (var i = 0; i < 5; i++) {
              results[i].id.should.equal(docs[i]._id, 'id matches');
              should.exist(results[i].rev, 'rev is set');
              // Update the doc
              docs[i]._rev = results[i].rev;
              docs[i].string = docs[i].string + ".00";
            }
            db.bulkDocs({docs: docs}, function(err, results) {
              results.should.have.length(5, 'results length matches');
              for (i = 0; i < 5; i++) {
                results[i].id.should.equal(i.toString(), 'id matches again');
                // set the delete flag to delete the docs in the next step
                docs[i]._rev = results[i].rev;
                docs[i]._deleted = true;
              }
              db.put(docs[0], function(err, doc) {
                db.bulkDocs({docs: docs}, function(err, results) {
                  results[0].name.should.equal('conflict', 'First doc should be in conflict');
                  should.not.exist(results[0].rev, 'no rev in conflict');
                  for (i = 1; i < 5; i++) {
                    results[i].id.should.equal(i.toString());
                    should.exist(results[i].rev);
                  }
                  done();
                });
              });
            });
          });
        });
      });

      it('No id in bulk docs', function(done) {
        testUtils.initTestDB(this.name, function(err, db) {
          var newdoc = {"_id": "foobar", "body": "baz"};
          db.put(newdoc, function(err, doc) {
            should.exist(doc.ok);
            var docs = [
              {"_id": newdoc._id, "_rev": newdoc._rev, "body": "blam"},
              {"_id": newdoc._id, "_rev": newdoc._rev, "_deleted": true}
            ];
            db.bulkDocs({docs: docs}, function(err, results) {
              (results[0].name === 'conflict' || results[1].name === 'conflict').should.be.ok;
              done();
            });
          });
        });
      });

      it('No _rev and new_edits=false', function(done) {
        testUtils.initTestDB(this.name, function(err, db) {
          var docs = [
            {_id: "foo", integer: 1}
          ];
          db.bulkDocs({docs: docs}, {new_edits: false}, function(err, res) {
            should.exist(err, "error reported");
            done();
          });
        });
      });

      it("Test errors on invalid doc id", function(done) {
        var docs = [
          {'_id': '_invalid', foo: 'bar'}
        ];
        testUtils.initTestDB(this.name, function(err, db) {
          db.bulkDocs({docs: docs}, function(err, info) {
            err.name.should.equal('bad_request', 'correct error returned');
            should.not.exist(info, 'info is empty');
            done();
          });
        });
      });

      it("Test two errors on invalid doc id", function(done) {
        var docs = [
          {'_id': '_invalid', foo: 'bar'},
          {'_id': 123, foo: 'bar'}
        ];
        testUtils.initTestDB(this.name, function(err, db) {
          db.bulkDocs({docs: docs}, function(err, info) {
            err.name.should.equal('bad_request', 'correct error returned');
            err.message.should.equal(PouchDB.Errors.RESERVED_ID.message, 'correct error message returned');
            should.not.exist(info, 'info is empty');
            done();
          });
        });
      });

      it('No docs', function(done) {
        testUtils.initTestDB(this.name, function(err, db) {
          db.bulkDocs({"doc": [{"foo":"bar"}]}, function(err, result) {
            err.status.should.equal(400);
            err.name.should.equal('bad_request');
            err.message.should.equal("Missing JSON list of 'docs'");
            done();
          });
        });
      });

      it('Jira 911', function(done) {
        testUtils.initTestDB(this.name, function(err, db) {
          var docs = [
            {"_id":"0", "a" : 0},
            {"_id":"1", "a" : 1},
            {"_id":"1", "a" : 1},
            {"_id":"3", "a" : 3}
          ];
          db.bulkDocs({docs: docs}, function(err, results) {
            results[1].id.should.equal("1", 'check ordering');
            should.not.exist(results[1].name, 'first id succeded');
            results[2].name.should.equal("conflict", 'second conflicted');
            results.should.have.length(4, 'got right amount of results');
            done();
          });
        });
      });

      it('Test multiple bulkdocs', function(done) {
        testUtils.initTestDB(this.name, function(err, db) {
          db.bulkDocs({docs: authors}, function (err, res) {
            db.bulkDocs({docs: authors}, function (err, res) {
              db.allDocs(function(err, result) {
                result.total_rows.should.equal(8, 'correct number of results');
                done();
              });
            });
          });
        });
      });

      it('Bulk with new_edits=false', function(done) {
        testUtils.initTestDB(this.name, function(err, db) {
          var docs = [
            {"_id":"foo","_rev":"2-x","_revisions":
              {"start":2,"ids":["x","a"]}
            },
            {"_id":"foo","_rev":"2-y","_revisions":
              {"start":2,"ids":["y","a"]}
            }
          ];
          db.bulkDocs({docs: docs}, {new_edits: false}, function(err, res){
            //ok(res.length === 0, "empty array returned");
            db.get("foo", {open_revs: "all"}, function(err, res){
              res[0].ok._rev.should.equal("2-x", "doc1 ok");
              res[1].ok._rev.should.equal("2-y", "doc2 ok");
              done();
            });
          });
        });
      });

      it('656 regression in handling deleted docs', function(done) {
        testUtils.initTestDB(this.name, function(err, db) {
          db.bulkDocs({docs: [{_id: "foo", _rev: "1-a", _deleted: true}]},
                      {new_edits: false}, function(err, res){
            db.get("foo", function(err, res){
              should.exist(err, "deleted");
              done();
            });
          });
        });
      });

      it('Test quotes in doc ids', function (done) {
        testUtils.initTestDB(this.name, function (err, db) {
          db.bulkDocs({docs: [
            {_id: "'your_sql_injection_script_here'"}
          ]}, function (err, res) {
            should.not.exist(err, 'got error: ' + JSON.stringify(err));
            db.get("foo", function (err, res) {
              should.exist(err, "deleted");
              done();
            });
          });
        });
      });

      it('Bulk docs empty list', function (done) {
        testUtils.initTestDB(this.name, function(err, db) {
          db.bulkDocs({docs: []}, function(err, res) {
            done(err);
          });
        });
      });
    })
  });
});