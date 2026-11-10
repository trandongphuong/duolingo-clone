"use client";

import simpleRestProvider from "ra-data-simple-rest";
import { Admin, Resource } from "react-admin";

import { ChallengeList } from "./challenge/list";
import { ChallengeOptionsList } from "./challengeOption/list";
import { CourseList } from "./course/list";
import { LessonList } from "./lesson/list";
import { UnitList } from "./unit/list";

const dataProvider = simpleRestProvider("/api");

const AppContent = () => {
  return (
    <Admin dataProvider={dataProvider} disableTelemetry>
      <Resource
        name="courses"
        recordRepresentation="title"
        list={CourseList}
      />

      <Resource
        name="units"
        recordRepresentation="title"
        list={UnitList}
      />

      <Resource
        name="lessons"
        recordRepresentation="title"
        list={LessonList}
      />

      <Resource
        name="challenges"
        recordRepresentation="question"
        list={ChallengeList}
      />

      <Resource
        name="challengeOptions"
        recordRepresentation="text"
        list={ChallengeOptionsList}
        options={{
          label: "Challenge Options",
        }}
      />
    </Admin>
  );
};

export default AppContent;
